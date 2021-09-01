import abc
import array
import base64
import dataclasses
import decimal
import json
import math
import sys

from typing import Any, Callable, Dict, Iterable, List, MutableSequence, Tuple, Union

NUM_VALUES = 128 - 3

class Writer:
    data: MutableSequence[int]

    def __init__(self) -> None:
        self.data = array.array('B')

    def write(self, values: Iterable[int]) -> None:
        for value in values:
            if not isinstance(value, int):
                raise ValueError('not an integer: {!r}'.format(value))
            if not (0 <= value < NUM_VALUES):
                raise ValueError('out of range: {}'.format(value))
            self.data.append(value)

################################################################################
# Values and parameters
################################################################################

EXPONENT = 0.94

class Raw:
    """A raw byte value, to be passed through instead of encoded."""
    value: int

    def __init__(self, value: int) -> None:
        if not isinstance(value, int):
            raise TypeError('not an integer')
        self.value = value

Value = Union[Raw, int, float]

MIN = Raw(NUM_VALUES - 1)
MAX = Raw(0)

class ValueEncoding(metaclass=abc.ABCMeta):
    """Base class for ways to encode values."""

    @abc.abstractmethod
    def decode(self, value: int) -> float:
        """Decode an encoded value as a floating-point number."""
        raise NotImplementedError()

    @abc.abstractmethod
    def decode_rounded(self, value: int) -> decimal.Decimal:
        """Decode an encoded value only using necessary digits."""
        raise NotImplementedError()

    def encode_float(self, value: float) -> int:
        """Encode a floating-point number as a byte."""
        raise NotImplementedError()

    def encode(self, value: Value) -> int:
        if isinstance(value, Raw):
            return value.value
        if isinstance(value, float):
            return self.encode_float(value)
        if isinstance(value, int):
            return self.encode_float(float(value))
        raise TypeError('invalid value type')

@dataclasses.dataclass(frozen=True)
class ExpScale(ValueEncoding):
    """Exponential scale for parameters."""
    name: str
    scale: float

    def decode(self, value: int) -> float:
        if not isinstance(value, int):
            raise TypeError('not an integer')
        return self.scale * EXPONENT ** value

    def decode_rounded(self, value: int) -> decimal.Decimal:
        v = decimal.Decimal(self.scale * EXPONENT ** value)
        n = v.adjusted()
        for i in range(5):
            y = round(v, -n+i)
            delta = decimal.Decimal((0, (1,), n-i))
            y0 = y - delta
            y1 = y + delta
            if y0 <= 0:
                continue
            x0 = round(math.log(float(y0) / self.scale, EXPONENT))
            x1 = round(math.log(float(y1) / self.scale, EXPONENT))
            if value - 1 <= x1 and x0 <= value + 1:
                if -n + i < 0:
                    return round(y, 0)
                return y
        raise ValueError('could not calculate rounded version')

    def encode_float(self, value: float) -> int:
        """Encode a floating-point number as a byte."""
        if not isinstance(value, float):
            raise TypeError('not a float')
        enc = round(math.log(value / self.scale, EXPONENT))
        if enc >= NUM_VALUES:
            enc = NUM_VALUES - 1
            print('Warning: {}({}) clamped to {}'
                .format(self.name, value, self.decode(enc)),
                file=sys.stderr)
        elif enc < 0:
            enc = 0
            print('Warning: {}({}) clamped to {}'
                .format(self.name, value, self.decode(enc)),
                file=sys.stderr)
        return enc

GainValue = ExpScale('gain', 1.0)
TimeValue = ExpScale('time', 20.0)
FrequencyValue = ExpScale('frequency', 20e3)

PARAMETER_ENCODING = 0

@dataclasses.dataclass(init=False)
class ParameterType:
    """A simple parameter encoding."""
    name: str
    encoding: int
    values: Tuple[ValueEncoding, ...]

    def __init__(self, name: str, *values: ValueEncoding):
        global PARAMETER_ENCODING
        self.name = name
        self.encoding = PARAMETER_ENCODING
        self.values = values
        PARAMETER_ENCODING += 1

    def __call__(self, *values: Value) -> 'Parameter':
        if len(values) != len(self.values):
            raise ValueError('{} got {} arguments, expect {}'
                .format(self.name, len(values), len(self.values)))
        encoded: List[int]
        encoded = []
        for (encoding, value) in zip(self.values, values):
            encoded.append(encoding.encode(value))
        return Parameter(self, tuple(encoded))

    def decode(self, *values: int) -> str:
        if len(values) != len(self.values):
            raise ValueError('{} got {} arguments, expect {}'
                .format(self.name, len(values), len(self.values)))
        decoded: List[str]
        decoded = []
        for (encoding, value) in zip(self.values, values):
            if not isinstance(value, int):
                raise TypeError('bad value: {!r}'.format(value))
            decoded.append(str(encoding.decode_rounded(value)))
        return '{}({})'.format(self.name, ', '.join(decoded))

@dataclasses.dataclass(frozen=True)
class Parameter:
    """A parameter encoded with its values."""
    paramtype: ParameterType
    values: Tuple[int, ...]

    def write(self, w: Writer) -> None:
        w.write((self.paramtype.encoding,))
        w.write(self.values)


################################################################################
# Node types
################################################################################

Opcode = Callable[[Writer], None]

OPCODES: Dict[str, Tuple[int, Opcode]]
OPCODES = {}

def node(*names: str) -> Callable[[Opcode], Opcode]:
    def wrapped(arg: Opcode) -> Opcode:
        for name in names:
            if name in OPCODES:
                raise Exception('duplicate opcode: {!r}'.format(name))
            OPCODES[name] = (len(OPCODES), arg)
        return arg
    return wrapped

class ProgramContext:
    writer: Writer

    def __init__(self) -> None:
        self.writer = Writer()

    def __getattr__(self, name: str) -> Callable[..., Any]:
        try:
            encoding, opcode = OPCODES[name]
        except KeyError:
            raise AttributeError('no such opcode: {!r}'.format(name))
        def f(**kwargs: Dict[Any, Any]) -> None:
            self.writer.write((encoding,))
            opcode(self.writer, **kwargs) # type: ignore
        return f

################################################################################
# Definitions
################################################################################

Default = ParameterType('Default')()
GConst = ParameterType('GConst', GainValue)
TConst = ParameterType('TConst', TimeValue)
FConst = ParameterType('FConst', FrequencyValue)
GADSR = ParameterType('GADSR', TimeValue, TimeValue, GainValue, TimeValue)
FADSR = ParameterType(
    'FADSR', FrequencyValue, FrequencyValue,
    TimeValue, TimeValue, GainValue, TimeValue)
Note = ParameterType('Note')()

@node('gain')
def node_gain(w: Writer, *, gain: Parameter = Default) -> None:
    if not isinstance(gain, Parameter):
        raise TypeError('gain is not Parameter')
    gain.write(w)

@node('lowpass', 'highpass', 'bandpass')
def node_filter(
        w: Writer, *,
        frequency: Parameter = Default,
        detune: Parameter = Default,
        q: Parameter = Default) -> None:
    if not isinstance(frequency, Parameter):
        raise TypeError('frequency is not Parameter')
    if not isinstance(detune, Parameter):
        raise TypeError('detune is not Parameter')
    if not isinstance(q, Parameter):
        raise TypeError('q is not Parameter')
    frequency.write(w)
    detune.write(w)
    q.write(w)

@node('square', 'sawtooth', 'triangle')
def node_oscillator(
        w: Writer, *,
        frequency: Parameter = Default,
        detune: Parameter = Default) -> None:
    if not isinstance(frequency, Parameter):
        raise TypeError('frequency is not Parameter')
    if not isinstance(detune, Parameter):
        raise TypeError('detune is not Parameter')
    frequency.write(w)
    detune.write(w)

################################################################################
# Instruments
################################################################################

InstrumentDef = Callable[[ProgramContext], None]

INSTRUMENTS: Dict[str, InstrumentDef]
INSTRUMENTS = {}

def instrument(name: str) -> Callable[[InstrumentDef], InstrumentDef]:
    def wrapped(arg: InstrumentDef) -> InstrumentDef:
        if name in INSTRUMENTS:
            raise ValueError('duplicate instrument name: {!r}'.format(name))
        INSTRUMENTS[name] = arg
        return arg
    return wrapped

################################################################################

@instrument('Bass')
def bass(c: ProgramContext) -> None:
    c.gain(
        gain=GADSR(MIN, 0.7, 0.2, 0.05),
    )
    for _ in range(2):
        c.lowpass(
            frequency=FADSR(400, 1200, 0.050, 0.5, MIN, 0.05),
            q=TConst(2.0),
        )
    c.sawtooth(
        frequency=Note,
    )

@instrument('Soft Lead')
def soft_lead(c: ProgramContext) -> None:
    c.gain(
        gain=GADSR(0.050, 0.4, 0.3, 1.7),
    )
    for _ in range(2):
        c.lowpass(
            frequency=FADSR(600, 6000, 0.17, 0.4, 0.3, 1.0),
            q=TConst(1.0),
        )
    c.sawtooth(
        frequency=Note,
    )

@instrument('Pluck')
def pluck(c: ProgramContext) -> None:
    c.gain(
        gain=GADSR(MIN, 0.9, MIN, 0.9),
    )
    c.bandpass(
        frequency=FADSR(600, 1800, MIN, 0.3, MIN, 0.3),
    )
    c.square(
        frequency=Note,
    )

################################################################################

def compile(func: Callable[[ProgramContext], None]) -> bytes:
    c = ProgramContext()
    func(c)
    return bytes(c.writer.data)

def main() -> None:
    instruments: Dict[str, str]
    instruments = {}
    for name, func in INSTRUMENTS.items():
        data = compile(func)
        encoded = base64.b64encode(data).decode('ASCII')
        instruments[name] = encoded
    json.dump({'instruments': instruments}, sys.stdout, indent=True)
    sys.stdout.write('\n')

if __name__ == '__main__':
    main()
