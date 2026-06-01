"""
通信系统仿真核心模块
基于 CommPy + NumPy 实现数字通信链路仿真
"""

import numpy as np
from scipy.special import erfc
from commpy.modulation import QAMModem, PSKModem
from commpy.channelcoding.convcode import Trellis, conv_encode, viterbi_decode
from commpy.filters import rcosfilter

MODULATIONS = ['BPSK', 'QPSK', '8PSK', '16QAM', '64QAM']
BPS = {'BPSK': 1, 'QPSK': 2, '8PSK': 3, '16QAM': 4, '64QAM': 6}


def _modem(mod):
    if 'QAM' in mod:
        return QAMModem(int(mod.replace('QAM', '')))
    m = {'BPSK': 2, 'QPSK': 4, '8PSK': 8}[mod]
    return PSKModem(m)


def _conv_trellis():
    return Trellis(np.array([2]), np.array([[0o7, 0o5]]))


def _awgn(sig, snr_db):
    snr = 10 ** (snr_db / 10)
    power = np.mean(np.abs(sig) ** 2)
    noise = np.sqrt(power / snr / 2) * (
        np.random.randn(len(sig)) + 1j * np.random.randn(len(sig)))
    return sig + noise


def _rayleigh(sig, snr_db):
    h = np.sqrt(0.5) * (
        np.random.randn(len(sig)) + 1j * np.random.randn(len(sig)))
    return _awgn(h * sig, snr_db) / h


def _channel(sig, snr_db, ch):
    return _rayleigh(sig, snr_db) if ch == 'Rayleigh' else _awgn(sig, snr_db)


def simulate_ber(mod, eb_n0_range, channel='AWGN', coding='none', num_bits=50000):
    modem = _modem(mod)
    bps = BPS[mod]
    rate = 0.5 if coding == 'conv' else 1.0
    trellis = _conv_trellis() if coding == 'conv' else None

    results = []
    for eb_n0 in eb_n0_range:
        es_n0 = eb_n0 + 10 * np.log10(bps * rate)
        bits = np.random.randint(0, 2, num_bits)

        coded = conv_encode(bits, trellis) if coding == 'conv' else bits
        pad = (bps - len(coded) % bps) % bps
        if pad:
            coded = np.append(coded, np.zeros(pad, dtype=int))
        n_coded = len(coded)

        tx = modem.modulate(coded)
        rx = _channel(tx, es_n0, channel)
        dec = modem.demodulate(rx, 'hard')[:n_coded]

        if coding == 'conv':
            rx_bits = viterbi_decode(
                dec.astype(np.float64), trellis, decoding_type='hard')
            n = min(len(bits), len(rx_bits))
            err = int(np.sum(bits[:n] != rx_bits[:n].astype(int)))
            ber = err / n
        else:
            err = int(np.sum(bits != dec[:num_bits].astype(int)))
            ber = err / num_bits

        results.append(max(float(ber), 1e-7))
    return results


def theoretical_ber(mod, eb_n0_range, channel='AWGN'):
    results = []
    for eb_n0 in eb_n0_range:
        g = 10 ** (eb_n0 / 10)
        b = None

        if channel == 'AWGN':
            if mod == 'BPSK':
                b = 0.5 * erfc(np.sqrt(g))
            elif mod == 'QPSK':
                b = 0.5 * erfc(np.sqrt(g))
            elif mod == '8PSK':
                b = (1 / 3) * erfc(np.sqrt(3 * g) * np.sin(np.pi / 8))
            elif mod == '16QAM':
                b = (3 / 8) * erfc(np.sqrt(2 * g / 5))
            elif mod == '64QAM':
                b = (7 / 24) * erfc(np.sqrt(g / 7))
        elif channel == 'Rayleigh':
            if mod in ('BPSK', 'QPSK'):
                b = 0.5 * (1 - np.sqrt(g / (1 + g)))

        results.append(max(float(b), 1e-10) if b is not None else None)
    return results


def constellation_data(mod, eb_n0, channel='AWGN', n=1500):
    modem = _modem(mod)
    bps = BPS[mod]
    es_n0 = eb_n0 + 10 * np.log10(bps)

    bits = np.random.randint(0, 2, n * bps)
    tx = modem.modulate(bits)
    rx = _channel(tx, es_n0, channel)

    return {
        'tx_i': tx.real.tolist(), 'tx_q': tx.imag.tolist(),
        'rx_i': rx.real.tolist(), 'rx_q': rx.imag.tolist(),
    }


def eye_diagram_data(mod, eb_n0, channel='AWGN', sps=16, n_sym=300):
    modem = _modem(mod)
    bps = BPS[mod]
    es_n0 = eb_n0 + 10 * np.log10(bps)

    bits = np.random.randint(0, 2, n_sym * bps)
    symbols = modem.modulate(bits).real

    if channel == 'Rayleigh':
        h = np.abs(np.sqrt(0.5) * (
            np.random.randn(len(symbols)) + 1j * np.random.randn(len(symbols))))
        symbols = symbols * h

    n_taps = 10 * sps + 1
    _, rc = rcosfilter(n_taps, 0.35, 1.0, sps)
    rc /= np.max(np.abs(rc))

    up = np.zeros(len(symbols) * sps)
    up[::sps] = symbols
    shaped = np.convolve(up, rc, mode='same')

    power = np.mean(shaped ** 2) + 1e-20
    n_std = np.sqrt(power / (10 ** (es_n0 / 10)))
    rx = shaped + n_std * np.random.randn(len(shaped))

    span = 2 * sps
    traces = []
    for i in range(n_taps // 2, len(rx) - span, sps):
        traces.append(rx[i:i + span].tolist())
        if len(traces) >= 80:
            break

    return {'t': np.linspace(0, 2, span).tolist(), 'traces': traces}


def waveform_data(mod, eb_n0, channel='AWGN', sps=8, n_sym=64):
    modem = _modem(mod)
    bps = BPS[mod]
    es_n0 = eb_n0 + 10 * np.log10(bps)

    bits = np.random.randint(0, 2, n_sym * bps)
    tx = modem.modulate(bits)
    rx = _channel(tx, es_n0, channel)

    tx_up = np.repeat(tx, sps)
    rx_up = np.repeat(rx, sps)
    t = (np.arange(len(tx_up)) / sps).tolist()

    n_fft = len(tx_up)
    freq = np.fft.fftshift(np.fft.fftfreq(n_fft, 1.0 / sps))
    tx_s = 20 * np.log10(np.fft.fftshift(np.abs(np.fft.fft(tx_up))) + 1e-10)
    rx_s = 20 * np.log10(np.fft.fftshift(np.abs(np.fft.fft(rx_up))) + 1e-10)

    return {
        'time': t,
        'tx_i': tx_up.real.tolist(), 'tx_q': tx_up.imag.tolist(),
        'rx_i': rx_up.real.tolist(), 'rx_q': rx_up.imag.tolist(),
        'freq': freq.tolist(),
        'tx_spec': tx_s.tolist(), 'rx_spec': rx_s.tolist(),
    }
