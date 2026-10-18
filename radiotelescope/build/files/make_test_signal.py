#!/usr/bin/env python3
"""Create two seconds of SYNTHETIC cu8 IQ: a 350 kHz tone plus seeded noise.

Run: python make_test_signal.py synthetic.cu8
Analyse with --fs 2400000 --fc 1420000000. Expected RF tone: 1420.350 MHz.
This is a file-format/software check, NOT simulated hydrogen or sky evidence.
"""
import argparse
from pathlib import Path
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    rng = np.random.default_rng(2026)
    fs, total, offset = 2400000, 4800000, 350000
    try:
        with args.output.open('xb') as out:
            for start in range(0, total, 240000):
                t = np.arange(start, min(start + 240000, total), dtype=float)
                x = .3 * np.exp(2j * np.pi * offset * t / fs)
                x += .04 * (rng.normal(size=t.size) + 1j * rng.normal(size=t.size))
                raw = np.empty(x.size * 2, dtype=np.uint8)
                raw[0::2] = np.clip(np.rint(128 * x.real + 127.5), 0, 255)
                raw[1::2] = np.clip(np.rint(128 * x.imag + 127.5), 0, 255)
                raw.tofile(out)
    except OSError as exc:
        parser.exit(2, 'error: ' + str(exc) + '\n')
    print('SYNTHETIC cu8, 9600000 bytes, Fs=2400000 Hz, fc=1420000000 Hz.')
    print('Expected tone near 1420.350 MHz. This is not a sky observation.')


if __name__ == '__main__':
    main()
