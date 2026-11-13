use crate::settings::AppSettings;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::Source;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};

const MAX_VOICES: usize = 64;
const DELAY_BUF_LEN: usize = 8192;

#[derive(Debug, Clone)]
pub struct AudioClip {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

impl AudioClip {
    pub fn decode_file(path: &Path) -> Result<Self, String> {
        let is_ogg = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("ogg"))
            .unwrap_or(false);

        let raw_samples: Result<(usize, u32, Vec<i16>), String> = (|| {
            let file = File::open(path)
                .map_err(|e| format!("Ses dosyası açılamadı ({}): {e}", path.display()))?;
            let reader = BufReader::new(file);
            match rodio::Decoder::new(reader) {
                Ok(dec) => {
                    let ch = dec.channels().max(1) as usize;
                    let sr = dec.sample_rate().max(8000);
                    Ok((ch, sr, dec.collect()))
                }
                Err(first_err) => {
                    if is_ogg {
                        if let Ok(file2) = File::open(path) {
                            if let Ok(dec2) = rodio::Decoder::new_vorbis(BufReader::new(file2)) {
                                let ch = dec2.channels().max(1) as usize;
                                let sr = dec2.sample_rate().max(8000);
                                return Ok((ch, sr, dec2.collect()));
                            }
                        }
                    }
                    Err(format!("Ses çözümlenemedi ({}): {first_err}", path.display()))
                }
            }
        })();

        let (channels, sample_rate, raw) = raw_samples?;
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
        self.slice_ms_f64(start_ms as f64, duration_ms as f64)
    }

    pub fn slice_range_ms(&self, start_ms: f64, end_ms: f64) -> Self {
        let dur = (end_ms - start_ms).max(1.0);
        self.slice_ms_f64(start_ms, dur)
    }

    pub fn slice_ms_f64(&self, start_ms: f64, duration_ms: f64) -> Self {
        let start_idx = ((start_ms.max(0.0) / 1000.0) * self.sample_rate as f64).round() as usize;
        let len_samples = ((duration_ms.max(0.0) / 1000.0) * self.sample_rate as f64).round() as usize;

        if start_idx >= self.samples.len() || len_samples == 0 {
            return Self {
                samples: vec![0.0; 64],
                sample_rate: self.sample_rate,
            };
        }

        let end_idx = (start_idx + len_samples).min(self.samples.len());
        let mut sliced = self.samples[start_idx..end_idx].to_vec();

        let fade_in = ((self.sample_rate as usize) / 800).min(sliced.len() / 4);
        for (i, sample) in sliced.iter_mut().take(fade_in).enumerate() {
            *sample *= (i as f32) / (fade_in.max(1) as f32);
        }
        let fade_out = ((self.sample_rate as usize) / 250).min(sliced.len() / 3);
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

#[derive(Debug, Clone, PartialEq)]
pub struct DspParams {
    pub low_db: f32,
    pub mid_db: f32,
    pub high_db: f32,
    pub room_ambience: f32,
}

impl DspParams {
    pub fn from_settings(cfg: &AppSettings) -> Self {
        let mut low = cfg.eq_low_db;
        let mut mid = cfg.eq_mid_db;
        let mut high = cfg.eq_high_db;

        match cfg.plate_preset.as_str() {
            "aluminum" => {
                mid += 1.5;
                high += 2.5;
            }
            "polycarbonate" => {
                low += 3.0;
                mid -= 0.5;
                high -= 2.5;
            }
            "brass" => {
                low -= 1.0;
                mid += 2.0;
                high += 4.0;
            }
            _ => {}
        }

        if cfg.tape_mod {
            low += 3.5;
            high -= 1.8;
        }
        if cfg.poron_foam {
            low += 1.2;
            mid -= 2.5;
        }

        Self {
            low_db: low.clamp(-12.0, 12.0),
            mid_db: mid.clamp(-12.0, 12.0),
            high_db: high.clamp(-12.0, 12.0),
            room_ambience: cfg.room_ambience.clamp(0.0, 1.0),
        }
    }
}

#[derive(Clone, Copy)]
struct BiquadCoeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl BiquadCoeffs {
    fn bypass() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }

    fn low_shelf(sr: f32, freq: f32, db: f32) -> Self {
        if db.abs() < 0.05 {
            return Self::bypass();
        }
        let a = 10.0f32.powf(db / 40.0);
        let w0 = 2.0 * std::f32::consts::PI * (freq / sr.max(8000.0)).min(0.45);
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / 2.0 * 1.4142135; // S = 1
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    fn peaking(sr: f32, freq: f32, q: f32, db: f32) -> Self {
        if db.abs() < 0.05 {
            return Self::bypass();
        }
        let a = 10.0f32.powf(db / 40.0);
        let w0 = 2.0 * std::f32::consts::PI * (freq / sr.max(8000.0)).min(0.45);
        let cos_w0 = w0.cos();
        let alpha = w0.sin() / (2.0 * q);

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_w0;
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha / a;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    fn high_shelf(sr: f32, freq: f32, db: f32) -> Self {
        if db.abs() < 0.05 {
            return Self::bypass();
        }
        let a = 10.0f32.powf(db / 40.0);
        let w0 = 2.0 * std::f32::consts::PI * (freq / sr.max(8000.0)).min(0.45);
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / 2.0 * 1.4142135;
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
        let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
        let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct BiquadState {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadState {
    #[inline]
    fn process(&mut self, x: f32, c: &BiquadCoeffs) -> f32 {
        let y = c.b0 * x + c.b1 * self.x1 + c.b2 * self.x2 - c.a1 * self.y1 - c.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = if y.is_finite() { y } else { 0.0 };
        self.y1
    }
}

struct DspProcessor {
    params: DspParams,
    sample_rate: f32,
    low_c: BiquadCoeffs,
    mid_c: BiquadCoeffs,
    high_c: BiquadCoeffs,
    low_l: BiquadState,
    low_r: BiquadState,
    mid_l: BiquadState,
    mid_r: BiquadState,
    high_l: BiquadState,
    high_r: BiquadState,
    delay_l: Vec<f32>,
    delay_r: Vec<f32>,
    delay_idx: usize,
    lp_l: f32,
    lp_r: f32,
    tail_samples: usize,
}

impl DspProcessor {
    fn new(sample_rate: u32, params: DspParams) -> Self {
        let mut p = Self {
            params: params.clone(),
            sample_rate: sample_rate.max(8000) as f32,
            low_c: BiquadCoeffs::bypass(),
            mid_c: BiquadCoeffs::bypass(),
            high_c: BiquadCoeffs::bypass(),
            low_l: BiquadState::default(),
            low_r: BiquadState::default(),
            mid_l: BiquadState::default(),
            mid_r: BiquadState::default(),
            high_l: BiquadState::default(),
            high_r: BiquadState::default(),
            delay_l: vec![0.0; DELAY_BUF_LEN],
            delay_r: vec![0.0; DELAY_BUF_LEN],
            delay_idx: 0,
            lp_l: 0.0,
            lp_r: 0.0,
            tail_samples: 0,
        };
        p.recompute_coeffs(sample_rate, params);
        p
    }

    fn recompute_coeffs(&mut self, sample_rate: u32, params: DspParams) {
        let sr = sample_rate.max(8000) as f32;
        self.sample_rate = sr;
        self.low_c = BiquadCoeffs::low_shelf(sr, 210.0, params.low_db);
        self.mid_c = BiquadCoeffs::peaking(sr, 1150.0, 1.0, params.mid_db);
        self.high_c = BiquadCoeffs::high_shelf(sr, 3400.0, params.high_db);
        self.params = params;
    }

    #[inline]
    fn process_frame(&mut self, mut l: f32, mut r: f32, has_active_voice: bool) -> (f32, f32) {
        // 3-band EQ + plate/mod shaping
        l = self.low_l.process(l, &self.low_c);
        r = self.low_r.process(r, &self.low_c);
        l = self.mid_l.process(l, &self.mid_c);
        r = self.mid_r.process(r, &self.mid_c);
        l = self.high_l.process(l, &self.high_c);
        r = self.high_r.process(r, &self.high_c);

        // Early-reflection room ambience
        if self.params.room_ambience > 0.005 {
            if has_active_voice {
                self.tail_samples = (self.sample_rate * 0.35) as usize;
            } else if self.tail_samples > 0 {
                self.tail_samples -= 1;
            }

            let tap1 = (self.delay_idx + DELAY_BUF_LEN - 1180) % DELAY_BUF_LEN;
            let tap2 = (self.delay_idx + DELAY_BUF_LEN - 2310) % DELAY_BUF_LEN;
            let tap3 = (self.delay_idx + DELAY_BUF_LEN - 3670) % DELAY_BUF_LEN;

            let refl_l = self.delay_l[tap1] * 0.52
                + self.delay_r[tap2] * 0.34
                + self.delay_l[tap3] * 0.22;
            let refl_r = self.delay_r[tap1] * 0.50
                + self.delay_l[tap2] * 0.36
                + self.delay_r[tap3] * 0.22;

            // Gentle HF room damping
            self.lp_l = self.lp_l * 0.45 + refl_l * 0.55;
            self.lp_r = self.lp_r * 0.45 + refl_r * 0.55;

            self.delay_l[self.delay_idx] = l + self.lp_l * 0.26;
            self.delay_r[self.delay_idx] = r + self.lp_r * 0.26;
            self.delay_idx = (self.delay_idx + 1) % DELAY_BUF_LEN;

            let wet = self.params.room_ambience * 0.48;
            l += self.lp_l * wet;
            r += self.lp_r * wet;
        } else {
            self.tail_samples = 0;
        }

        (soft_limit(l), soft_limit(r))
    }
}

struct ActiveVoice {
    clip: Arc<AudioClip>,
    pos: f64,
    step: f64,
    gain_l: f32,
    gain_r: f32,
}

struct MixerShared {
    voices: Vec<ActiveVoice>,
    dsp: DspProcessor,
}

enum AudioCtrl {
    SetDevice(Option<String>, mpsc::Sender<Result<u32, String>>),
}

pub struct AudioEngine {
    shared: Arc<Mutex<MixerShared>>,
    device_sample_rate: Arc<AtomicU32>,
    ctrl_tx: mpsc::Sender<AudioCtrl>,
}

impl AudioEngine {
    pub fn new(initial_device: Option<String>, initial_dsp: DspParams) -> Self {
        let shared = Arc::new(Mutex::new(MixerShared {
            voices: Vec::with_capacity(MAX_VOICES),
            dsp: DspProcessor::new(44100, initial_dsp),
        }));
        let device_sample_rate = Arc::new(AtomicU32::new(44100));
        let (ctrl_tx, ctrl_rx) = mpsc::channel::<AudioCtrl>();

        let shared_bg = Arc::clone(&shared);
        let rate_bg = Arc::clone(&device_sample_rate);

        std::thread::Builder::new()
            .name("sxmcaps-audio".to_string())
            .spawn(move || {
                let mut current_stream: Option<cpal::Stream> = None;

                if let Ok((stream, sr)) = open_output_stream(initial_device.as_deref(), &shared_bg)
                {
                    rate_bg.store(sr, Ordering::Relaxed);
                    if let Ok(mut guard) = shared_bg.lock() {
                        let p = guard.dsp.params.clone();
                        guard.dsp.recompute_coeffs(sr, p);
                    }
                    current_stream = Some(stream);
                }

                while let Ok(cmd) = ctrl_rx.recv() {
                    match cmd {
                        AudioCtrl::SetDevice(name, reply) => {
                            drop(current_stream.take());
                            match open_output_stream(name.as_deref(), &shared_bg) {
                                Ok((stream, sr)) => {
                                    rate_bg.store(sr, Ordering::Relaxed);
                                    if let Ok(mut guard) = shared_bg.lock() {
                                        let p = guard.dsp.params.clone();
                                        guard.dsp.recompute_coeffs(sr, p);
                                    }
                                    current_stream = Some(stream);
                                    let _ = reply.send(Ok(sr));
                                }
                                Err(err) => {
                                    if name.is_some() {
                                        if let Ok((stream, sr)) =
                                            open_output_stream(None, &shared_bg)
                                        {
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
            shared,
            device_sample_rate,
            ctrl_tx,
        }
    }

    pub fn update_dsp(&self, params: DspParams) {
        let sr = self.device_sample_rate.load(Ordering::Relaxed).max(8000);
        if let Ok(mut guard) = self.shared.lock() {
            if guard.dsp.params != params {
                guard.dsp.recompute_coeffs(sr, params);
            }
        }
    }

    pub fn play_clip(&self, clip: &Arc<AudioClip>, volume: f32, pitch_variation: f32, pan: f32) {
        if volume <= 0.001 || clip.samples.is_empty() {
            return;
        }

        let out_sr = self.device_sample_rate.load(Ordering::Relaxed).max(8000) as f64;
        let base_step = clip.sample_rate as f64 / out_sr;

        let pitch_jitter = if pitch_variation > 0.0001 {
            let r = fastrand::f32() * 2.0 - 1.0;
            1.0 + (r * pitch_variation.clamp(0.0, 0.25)) as f64
        } else {
            1.0
        };

        let vol_jitter = 0.96 + fastrand::f32() * 0.08;
        let total_gain = (volume * vol_jitter).clamp(0.0, 2.0);

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

        if let Ok(mut guard) = self.shared.lock() {
            if guard.voices.len() >= MAX_VOICES {
                guard.voices.remove(0);
            }
            guard.voices.push(voice);
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
    shared: &Arc<Mutex<MixerShared>>,
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

    let shared_cb = Arc::clone(shared);
    let err_fn = |err| {
        eprintln!("[sxmcaps audio] stream error: {err}");
    };

    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_output_stream(
            &config,
            move |data: &mut [f32], _| mix_into_f32(data, channels, &shared_cb),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_output_stream(
            &config,
            move |data: &mut [i16], _| mix_into_i16(data, channels, &shared_cb),
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_output_stream(
            &config,
            move |data: &mut [u16], _| mix_into_u16(data, channels, &shared_cb),
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

#[inline]
fn mix_next_frame(shared: &mut MixerShared) -> (f32, f32) {
    let has_voices = !shared.voices.is_empty();
    let mut left = 0.0f32;
    let mut right = 0.0f32;
    let mut idx = 0;

    while idx < shared.voices.len() {
        let voice = &mut shared.voices[idx];
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
            shared.voices.swap_remove(idx);
        }
    }

    shared.dsp.process_frame(left, right, has_voices)
}

fn mix_into_f32(output: &mut [f32], channels: usize, shared_mutex: &Arc<Mutex<MixerShared>>) {
    let Ok(mut shared) = shared_mutex.try_lock() else {
        output.fill(0.0);
        return;
    };
    if shared.voices.is_empty() && shared.dsp.tail_samples == 0 {
        output.fill(0.0);
        return;
    }

    for frame in output.chunks_exact_mut(channels.max(1)) {
        let (l, r) = mix_next_frame(&mut shared);
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

fn mix_into_i16(output: &mut [i16], channels: usize, shared_mutex: &Arc<Mutex<MixerShared>>) {
    let Ok(mut shared) = shared_mutex.try_lock() else {
        output.fill(0);
        return;
    };
    if shared.voices.is_empty() && shared.dsp.tail_samples == 0 {
        output.fill(0);
        return;
    }

    for frame in output.chunks_exact_mut(channels.max(1)) {
        let (l, r) = mix_next_frame(&mut shared);
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

fn mix_into_u16(output: &mut [u16], channels: usize, shared_mutex: &Arc<Mutex<MixerShared>>) {
    let Ok(mut shared) = shared_mutex.try_lock() else {
        output.fill(32768);
        return;
    };
    if shared.voices.is_empty() && shared.dsp.tail_samples == 0 {
        output.fill(32768);
        return;
    }

    for frame in output.chunks_exact_mut(channels.max(1)) {
        let (l, r) = mix_next_frame(&mut shared);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dsp_params_applies_plate_and_mods_with_clamp() {
        let mut cfg = AppSettings::default();
        cfg.plate_preset = "polycarbonate".to_string();
        cfg.tape_mod = true;
        cfg.poron_foam = true;
        cfg.eq_low_db = 9.0;
        cfg.eq_mid_db = 1.0;
        cfg.eq_high_db = 0.0;
        cfg.room_ambience = 1.5;

        let p = DspParams::from_settings(&cfg);
        assert_eq!(p.low_db, 12.0);
        assert!((p.mid_db - (-2.0)).abs() < 0.01);
        assert!((p.high_db - (-4.3)).abs() < 0.01);
        assert_eq!(p.room_ambience, 1.0);
    }

    #[test]
    fn dsp_processor_produces_finite_stereo_frames() {
        let params = DspParams {
            low_db: 4.5,
            mid_db: -2.0,
            high_db: 3.0,
            room_ambience: 0.45,
        };
        let mut dsp = DspProcessor::new(48_000, params);
        for i in 0..512 {
            let sig = if i < 64 { (i as f32 * 0.1).sin() * 0.6 } else { 0.0 };
            let (l, r) = dsp.process_frame(sig, sig, i < 64);
            assert!(l.is_finite() && r.is_finite());
            assert!(l.abs() <= 2.0 && r.abs() <= 2.0);
        }
        assert!(dsp.tail_samples > 0);
    }
}
