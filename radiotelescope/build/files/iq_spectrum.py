#!/usr/bin/env python3
"""Reference offline IQ spectrum, not a detection or absolute calibration tool.

Dependencies: numpy, matplotlib. Input is headerless cu8 or interleaved cf32_le.
All acquisition metadata must be supplied from the real capture log.
"""
import argparse
import json
from pathlib import Path
import numpy as np


def spectrum(input_path, fs, fc, fft_size=4096, sample_format='cu8'):
    if not np.isfinite(fs) or fs <= 0 or not np.isfinite(fc) or fc < 0:
        raise ValueError('fs must be positive and fc non-negative; both finite Hz')
    if fft_size < 16 or fft_size > 1048576 or fft_size & (fft_size - 1):
        raise ValueError('fft-size must be a power of two between 16 and 1048576')
    if sample_format not in ('cu8', 'cf32_le'):
        raise ValueError('format must be cu8 or cf32_le')
    input_path = Path(input_path)
    dtype = np.dtype('u1' if sample_format == 'cu8' else '<f4')
    sample_bytes = 2 * dtype.itemsize
    size = input_path.stat().st_size
    if size % sample_bytes:
        raise ValueError('file ends within an I/Q sample: check format or truncation')
    window = np.hanning(fft_size)
    energy = np.sum(window ** 2)
    accumulated = np.zeros(fft_size, dtype=np.float64)
    frames = 0
    scalars = 0
    extreme = 0
    with input_path.open('rb') as stream:
        while True:
            raw = np.fromfile(stream, dtype=dtype, count=2 * fft_size * 32)
            if not raw.size:
                break
            if not np.isfinite(raw).all():
                raise ValueError('non-finite input values')
            if sample_format == 'cu8':
                extreme += int(np.count_nonzero((raw <= 1) | (raw >= 254)))
                values = (raw.astype(np.float64) - 127.5) / 128.0
            else:
                values = raw.astype(np.float64)
            scalars += raw.size
            count = raw.size // (2 * fft_size)
            if not count:
                break
            values = values[:count * 2 * fft_size]
            iq = (values[0::2] + 1j * values[1::2]).reshape(count, fft_size)
            iq -= iq.mean(axis=1, keepdims=True)
            transformed = np.fft.fft(iq * window, axis=1)
            accumulated += np.sum(abs(transformed) ** 2, axis=0)
            frames += count
    if not frames:
        raise ValueError('not enough samples for one FFT frame')
    power = np.fft.fftshift(accumulated / (frames * fs * energy))
    frequency = fc + np.fft.fftshift(np.fft.fftfreq(fft_size, 1 / fs))
    info = dict(input_file=input_path.name, input_format=sample_format,
                acquisition_metadata='fs/fc supplied by operator; verify against capture log',
                sample_rate_hz=fs, center_frequency_hz=fc, fft_size=fft_size,
                window='symmetric Hann (numpy.hanning)', mean_removal='per FFT frame',
                overlap=0, averaging='linear power, equal frames', fft_frames=frames,
                samples_total=size // sample_bytes, samples_used=frames * fft_size,
                samples_tail_ignored=size // sample_bytes - frames * fft_size,
                integration_seconds=frames * fft_size / fs,
                bin_spacing_hz=fs / fft_size, enbw_hz=float(fs * energy / window.sum() ** 2),
                psd_units='relative squared input units per Hz; not dBm or K',
                cu8_scale='(byte - 127.5) / 128.0' if sample_format == 'cu8' else None,
                cu8_edge_code_fraction=extreme / scalars if sample_format == 'cu8' else None,
                detection_claim=False,
                limitations=['Cannot infer sample drops from headerless raw data.',
                             'RF frequency calibration and celestial origin are not verified.',
                             'No absolute power or temperature calibration.'])
    return frequency, power, info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--fs', type=float, required=True, help='Actual sample rate in Hz')
    parser.add_argument('--fc', type=float, required=True, help='Actual centre frequency in Hz')
    parser.add_argument('--fft-size', type=int, default=4096)
    parser.add_argument('--format', choices=['cu8', 'cf32_le'], default='cu8')
    parser.add_argument('--out', type=Path, required=True, help='Output prefix; files must not exist')
    args = parser.parse_args()
    try:
        paths = [Path(str(args.out) + suffix) for suffix in ('.csv', '.json', '.png')]
        if any(p.exists() for p in paths):
            raise ValueError('an output file already exists; select another --out prefix')
        f, p, info = spectrum(args.input, args.fs, args.fc, args.fft_size, args.format)
        db = 10 * np.log10(np.maximum(p, np.finfo(float).tiny))
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(11, 4.8), constrained_layout=True)
        ax.plot(f / 1e6, db, lw=.8, color='#19737b')
        ax.axvline(1420.40575, color='#b17520', lw=.8, ls='--', label='H I rest frequency (reference only)')
        ax.set(xlabel='RF frequency (MHz; operator-supplied centre)',
               ylabel='Relative PSD (dB units²/Hz)', title=args.input.name)
        ax.grid(alpha=.2)
        ax.legend(fontsize=8)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        np.savetxt(paths[0], np.column_stack((f, p, db)), delimiter=',',
                   header='frequency_hz,relative_psd_per_hz,relative_psd_db_per_hz', comments='')
        paths[1].write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
        fig.savefig(paths[2], dpi=160)
        plt.close(fig)
        print(json.dumps(info, indent=2))
    except (ValueError, OSError, ImportError) as exc:
        parser.exit(2, 'error: ' + str(exc) + '\n')


if __name__ == '__main__':
    main()
