"""Independent numerical checks. All signals here are synthetic, never sky data."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'radiotelescope/build/files/iq_spectrum.py'
spec = importlib.util.spec_from_file_location('iq_spectrum', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class SpectrumChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.n = 4096
        self.fs = 2400000
        self.fc = 1420000000
        rng = np.random.default_rng(804)
        t = np.arange(self.n * 128)
        self.x = .3 * np.exp(2j * np.pi * 601 * t / self.n)
        self.x += .035 * (rng.normal(size=t.size) + 1j * rng.normal(size=t.size))
        raw = np.empty(self.x.size * 2, dtype=np.uint8)
        raw[0::2] = np.clip(np.rint(128 * self.x.real + 127.5), 0, 255)
        raw[1::2] = np.clip(np.rint(128 * self.x.imag + 127.5), 0, 255)
        self.file = self.directory / 'synthetic.cu8'
        raw.tofile(self.file)
        self.decoded = (raw[0::2].astype(float) - 127.5) / 128 + 1j * (raw[1::2].astype(float) - 127.5) / 128

    def test_tone_axis_power_normalisation_and_units(self):
        f, p, info = mod.spectrum(self.file, self.fs, self.fc)
        self.assertEqual(f[np.argmax(p)], self.fc + 601 * self.fs / self.n)
        self.assertEqual(f[0], self.fc - self.fs / 2)
        self.assertEqual(f[self.n // 2], self.fc)
        measured = np.sum(p) * self.fs / self.n
        expected = np.mean(abs(self.decoded) ** 2)
        self.assertAlmostEqual(measured / expected, 1, delta=.005)
        self.assertEqual(info['fft_frames'], 128)
        self.assertEqual(info['samples_tail_ignored'], 0)
        self.assertAlmostEqual(info['enbw_hz'] / info['bin_spacing_hz'], 1.5, delta=.001)
        self.assertFalse(info['detection_claim'])
        self.assertIn('not dBm or K', info['psd_units'])

    def test_formats_and_tail(self):
        alternate = self.directory / 'same.cf32'
        self.decoded.astype('<c8').tofile(alternate)
        a = mod.spectrum(self.file, self.fs, self.fc)
        b = mod.spectrum(alternate, self.fs, self.fc, sample_format='cf32_le')
        np.testing.assert_allclose(a[1], b[1], rtol=1e-10, atol=1e-20)
        with self.file.open('ab') as out:
            out.write(bytes([127, 128]) * 17)
        f, p, info = mod.spectrum(self.file, self.fs, self.fc)
        np.testing.assert_array_equal(p, a[1])
        self.assertEqual(info['samples_tail_ignored'], 17)

    def test_rejects_corruption_and_bad_metadata(self):
        for fs in [0, -1, float('nan')]:
            with self.assertRaises(ValueError):
                mod.spectrum(self.file, fs, self.fc)
        for n in [15, 1000, 2097152]:
            with self.assertRaises(ValueError):
                mod.spectrum(self.file, self.fs, self.fc, fft_size=n)
        bad = self.directory / 'bad'
        for raw in [b'X', bytes(40)]:
            bad.write_bytes(raw)
            with self.assertRaises(ValueError):
                mod.spectrum(bad, self.fs, self.fc)
        np.full(8192, np.nan, dtype='<f4').tofile(bad)
        with self.assertRaises(ValueError):
            mod.spectrum(bad, self.fs, self.fc, sample_format='cf32_le')

    def test_cli_outputs_and_refuses_overwrite(self):
        prefix = self.directory / 'result'
        command = [sys.executable, str(SCRIPT), str(self.file), '--fs', str(self.fs), '--fc', str(self.fc), '--out', str(prefix)]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(prefix.with_suffix('.json').read_text())['fft_frames'], 128)
        self.assertEqual(np.loadtxt(prefix.with_suffix('.csv'), delimiter=',', skiprows=1).shape, (4096, 3))
        self.assertTrue(prefix.with_suffix('.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
        before = prefix.with_suffix('.json').read_bytes()
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 2)
        self.assertEqual(before, prefix.with_suffix('.json').read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
