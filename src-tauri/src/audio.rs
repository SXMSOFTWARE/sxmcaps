use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::Source;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};

const MAX_VOICES: usize = 64;

#[derive(Debug, Clone)]
pub struct AudioClip {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

impl AudioClip {
    pub fn decode_file(path: &Path) -> Result<Self, String> {
        let file = File::open(path)
            .map_err(|e| format!("Ses dosyası açılamadı ({}): {e}", path.display()))?;
        let reader = BufReader::new(file);
        let decoder = rodio::Decoder::new(reader)
            .map_err(|e| format!("Ses çözümlenemedi ({}): {e}", path.display()))?;

        let channels = decoder.channels().max(1) as usize;
        let sample_rate = decoder.sample_rate().max(8000);

        let raw: Vec<i16> = decoder.collect();
        if raw.is_empty() {
            return Err(format!("Boş ses dosyası: {}", path.display()));
        }

        let frames = raw.len() / channels;
        let mut mono = Vec::with_capacity(frames);
        for chunk in raw.chunks_exact(channels) {
            let mut sum = 0.0f32;
            for &s in chunk {
                sum += s as f32 / 32768.0;
            }
            mono.push(sum / channels as f32);
        }

        Ok(Self {
            samples: mono,
            sample_rate,
        })
    }

    pub fn slice_ms(&self, start_ms: u64, duration_ms: u64) -> Self {
        let start_idx = ((start_ms as f64 / 1000.0) * self.sample_rate as f64) as usize;
        let len_samples = ((duration_ms as f64 / 1000.0) * self.sample_rate as f64) as usize;

        if start_idx >= self.samples.len() || len_samples == 0 {
            return Self {
                samples: vec![0.0; 64],
                sample_rate: self.sample_rate,
            };
        }

        let end_idx = (start_idx + len_samples).min(self.samples.len());
        let mut sliced = self.samples[start_idx..end_idx].to_vec();

        // Short micro-fade on slice edges to avoid pops/clicks
        let fade_in = ((self.sample_rate as usize) / 500).min(sliced.len() / 4);
        for (i, sample) in sliced.iter_mut().take(fade_in).enumerate() {
            *sample *= (i as f32) / (fade_in.max(1) as f32);
        }
        let fade_out = ((self.sample_rate as usize) / 200).min(sliced.len() / 3);
        let len = sliced.len();
        for i in 0..fade_out {
            sliced[len - 1 - i] *= (i as f32) / (fade_out.max(1) as f32);
        }

        Self {
            samples: sliced,
            sample_rate: self.sample_rate,
        }
    }
}

struct ActiveVoice {
    clip: Arc<AudioClip>,
    pos: f64,
    step: f64,
    gain_l: f32,
    gain_r: f32,
}

enum AudioCtrl {
    SetDevice(Option<String>, mpsc::Sender<Result<u32, String>>),
}

pub struct AudioEngine {
    voices: Arc<Mutex<Vec<ActiveVoice>>>,
    device_sample_rate: Arc<AtomicU32>,
    ctrl_tx: mpsc::Sender<AudioCtrl>,
}

impl AudioEngine {
    pub fn new(initial_device: Option<String>) -> Self {
        let voices = Arc::new(Mutex::new(Vec::with_capacity(MAX_VOICES)));
        let device_sample_rate = Arc::new(AtomicU32::new(44100));
        let (ctrl_tx, ctrl_rx) = mpsc::channel::<AudioCtrl>();

        let voices_bg = Arc::clone(&voices);
        let rate_bg = Arc::clone(&device_sample_rate);

        std::thread::Builder::new()
            .name("sxmcaps-audio".to_string())
            .spawn(move || {
                let mut current_stream: Option<cpal::Stream> = None;

                if let Ok((stream, sr)) = open_output_stream(initial_device.as_deref(), &voices_bg) {
                    rate_bg.store(sr, Ordering::Relaxed);
                    current_stream = Some(stream);
                }

                while let Ok(cmd) = ctrl_rx.recv() {
                    match cmd {
                        AudioCtrl::SetDevice(name, reply) => {
                            drop(current_stream.take());
                            match open_output_stream(name.as_deref(), &voices_bg) {
                                Ok((stream, sr)) => {
                                    rate_bg.store(sr, Ordering::Relaxed);
                                    current_stream = Some(stream);
                                    let _ = reply.send(Ok(sr));
                                }
                                Err(err) => {
                                    // Fallback to default device if selected device failed
                                    if name.is_some() {
                                        if let Ok((stream, sr)) = open_output_stream(None, &voices_bg) {
                                            rate_bg.store(sr, Ordering::Relaxed);
                                            current_stream = Some(stream);
                                        }
                                    }
                                    let _ = reply.send(Err(err));
                                }
                            }
                        }
                    }
                }
            })
            .expect("audio thread spawn failed");

        Self {
            voices,
            device_sample_rate,
            ctrl_tx,
        }
    }

    pub fn play_clip(&self, clip: &Arc<AudioClip>, volume: f32, pitch_variation: f32, pan: f32) {
        if volume <= 0.001 || clip.samples.is_empty() {
            return;
        }

        let out_sr = self.device_sample_rate.load(Ordering::Relaxed).max(8000) as f64;
        let base_step = clip.sample_rate as f64 / out_sr;

        let pitch_jitter = if pitch_variation > 0.0001 {
            let r = fastrand::f32() * 2.0 - 1.0; // [-1.0, 1.0]
            1.0 + (r * pitch_variation.clamp(0.0, 0.25)) as f64
        } else {
            1.0
        };

        // Subtle organic gain variance (±4%)
        let vol_jitter = 0.96 + fastrand::f32() * 0.08;
        let total_gain = (volume * vol_jitter).clamp(0.0, 2.0);

        // Equal-power stereo panning (-1.0 left .. +1.0 right)
        let p = pan.clamp(-0.85, 0.85);
        let angle = (p + 1.0) * std::f32::consts::FRAC_PI_4;
        let gain_l = total_gain * angle.cos() * 1.15;
        let gain_r = total_gain * angle.sin() * 1.15;

        let voice = ActiveVoice {
            clip: Arc::clone(clip),
            pos: 0.0,
            step: (base_step * pitch_jitter).max(0.1),
            gain_l,
            gain_r,
        };

        if let Ok(mut guard) = self.voices.lock() {
            if guard.len() >= MAX_VOICES {
                // Evict oldest voice cleanly so rapid typing never drops new hits
                guard.remove(0);
            }
            guard.push(voice);
        }
    }

    pub fn set_output_device(&self, name: Option<String>) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.ctrl_tx
            .send(AudioCtrl::SetDevice(name, tx))
            .map_err(|_| "Ses motoru kanalı kapalı".to_string())?;
        rx.recv()
            .map_err(|_| "Ses cihazı yanıt vermedi".to_string())?
            .map(|_| ())
    }

    pub fn list_output_devices() -> Vec<String> {
        let host = cpal::default_host();
        let mut names = Vec::new();
        if let Ok(devices) = host.output_devices() {
            for dev in devices {
                if let Ok(name) = dev.name() {
                    if !names.contains(&name) {
                        names.push(name);
                    }
                }
            }
        }
        names
    }
}

fn open_output_stream(
    preferred_name: Option<&str>,
    voices: &Arc<Mutex<Vec<ActiveVoice>>>,
) -> Result<(cpal::Stream, u32), String> {
    let host = cpal::default_host();

    let device = if let Some(target) = preferred_name {
        host.output_devices()
            .ok()
            .and_then(|mut devs| devs.find(|d| d.name().ok().as_deref() == Some(target)))
            .or_else(|| host.default_output_device())
    } else {
        host.default_output_device()
    }
    .ok_or_else(|| "Ses çıkış cihazı bulunamadı".to_string())?;

    let supported_cfg = device
        .default_output_config()
        .map_err(|e| format!("Ses yapılandırması alınamadı: {e}"))?;

    let sample_format = supported_cfg.sample_format();
    let config: cpal::StreamConfig = supported_cfg.into();
    let sample_rate = config.sample_rate.0;
    let channels = config.channels as usize;

    let voices_cb = Arc::clone(voices);
    let err_fn = |err| {
        eprintln!("[sxmcaps audio] stream error: {err}");
    };

    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_output_stream(
            &config,
            move |data: &mut [f32], _| mix_into_f32(data, channels, &voices_cb),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_output_stream(
            &config,
            move |data: &mut [i16], _| mix_into_i16(data, channels, &voices_cb),
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_output_stream(
            &config,
            move |data: &mut [u16], _| mix_into_u16(data, channels, &voices_cb),
            err_fn,
            None,
        ),
        other => {
            return Err(format!("Desteklenmeyen ses örnekleme formatı: {other:?}"));
        }
    }
    .map_err(|e| format!("Ses akışı başlatılamadı: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("Ses akışı oynatılamadı: {e}"))?;

    Ok((stream, sample_rate))
}

#[inline]
fn soft_limit(x: f32) -> f32 {
    if x.abs() <= 0.92 {
        x
    } else {
        0.92 + (x - 0.92 * x.signum()).tanh() * 0.08
    }
}

fn mix_frame(voices: &mut Vec<ActiveVoice>) -> (f32, f32) {
    let mut left = 0.0f32;
    let mut right = 0.0f32;
    let mut idx = 0;

    while idx < voices.len() {
        let voice = &mut voices[idx];
        let samples = &voice.clip.samples;
        let pos_i = voice.pos as usize;

        if pos_i + 1 < samples.len() {
            let frac = (voice.pos - pos_i as f64) as f32;
            let s0 = samples[pos_i];
            let s1 = samples[pos_i + 1];
            let sample = s0 + (s1 - s0) * frac;

            left += sample * voice.gain_l;
            right += sample * voice.gain_r;
            voice.pos += voice.step;
            idx += 1;
        } else if pos_i < samples.len() {
            let sample = samples[pos_i];
            left += sample * voice.gain_l;
            right += sample * voice.gain_r;
            voice.pos += voice.step;
            idx += 1;
        } else {
            voices.swap_remove(idx);
        }
    }

    (soft_limit(left), soft_limit(right))
}

fn mix_into_f32(output: &mut [f32], channels: usize, voices_mutex: &Arc<Mutex<Vec<ActiveVoice>>>) {
    let Ok(mut voices) = voices_mutex.try_lock() else {
        output.fill(0.0);
        return;
    };
    if voices.is_empty() {
        output.fill(0.0);
        return;
    }

    for frame in output.chunks_exact_mut(channels.max(1)) {
        let (l, r) = mix_frame(&mut voices);
        if channels == 1 {
            frame[0] = (l + r) * 0.5;
        } else {
            frame[0] = l;
            frame[1] = r;
            for extra in frame.iter_mut().skip(2) {
                *extra = (l + r) * 0.5;
            }
        }
    }
}

fn mix_into_i16(output: &mut [i16], channels: usize, voices_mutex: &Arc<Mutex<Vec<ActiveVoice>>>) {
    let Ok(mut voices) = voices_mutex.try_lock() else {
        output.fill(0);
        return;
    };
    if voices.is_empty() {
        output.fill(0);
        return;
    }

    for frame in output.chunks_exact_mut(channels.max(1)) {
        let (l, r) = mix_frame(&mut voices);
        if channels == 1 {
            frame[0] = ((l + r) * 0.5 * 32767.0) as i16;
        } else {
            frame[0] = (l * 32767.0) as i16;
            frame[1] = (r * 32767.0) as i16;
            for extra in frame.iter_mut().skip(2) {
                *extra = ((l + r) * 0.5 * 32767.0) as i16;
            }
        }
    }
}

fn mix_into_u16(output: &mut [u16], channels: usize, voices_mutex: &Arc<Mutex<Vec<ActiveVoice>>>) {
    let Ok(mut voices) = voices_mutex.try_lock() else {
        output.fill(32768);
        return;
    };
    if voices.is_empty() {
        output.fill(32768);
        return;
    }

    for frame in output.chunks_exact_mut(channels.max(1)) {
        let (l, r) = mix_frame(&mut voices);
        if channels == 1 {
            frame[0] = ((((l + r) * 0.5) + 1.0) * 32767.5) as u16;
        } else {
            frame[0] = ((l + 1.0) * 32767.5) as u16;
            frame[1] = ((r + 1.0) * 32767.5) as u16;
            for extra in frame.iter_mut().skip(2) {
                *extra = ((((l + r) * 0.5) + 1.0) * 32767.5) as u16;
            }
        }
    }
}
