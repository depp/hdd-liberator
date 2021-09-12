from __future__ import annotations

import abc
import array
import base64
import dataclasses
import decimal
import json
import math
import sys

from typing import (
    Any, Callable, Dict, Iterable, List, MutableSequence, Optional, Tuple,
    Type, Union
)
from types import TracebackType

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
    name: str

    def __init__(self, name: str) -> None:
        if not isinstance(name, str):
            raise TypeError('name is not string')
        self.name = name

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

    def clamp(self, value: float, enc: int) -> int:
        """Clamp an encoded value to the range of this encoding."""
        if not isinstance(enc, int):
            raise TypeError('enc is not int')
        clamped: int
        if enc >= NUM_VALUES:
            clamped = NUM_VALUES - 1
        elif enc < 0:
            clamped = 0
        else:
            return enc
        print('Warning: {}({}) clamped to {}'
            .format(self.name, value, self.decode_rounded(clamped)),
            file=sys.stderr)
        return clamped

class LinScale(ValueEncoding):
    """Linear scale for parameters."""
    scale: float
    bipolar: bool

    def __init__(self, name: str, scale: float, bipolar: bool) -> None:
        super(LinScale, self).__init__(name)
        if not isinstance(scale, float):
            raise TypeError('scale is not float')
        if not isinstance(bipolar, bool):
            raise TypeError('bipolar is not bool')
        self.scale = scale
        self.bipolar = bipolar

    def zero(self) -> int:
        """Return the encoding for zero."""
        if self.bipolar:
            return (NUM_VALUES - 1) // 2
        return 0

    def decode(self, value: int) -> float:
        if not isinstance(value, int):
            raise TypeError('value is not int')
        return self.scale * (value - self.zero())

    def decode_rounded(self, value: int) -> decimal.Decimal:
        prec = math.ceil(-math.log10(self.scale))
        v = decimal.Decimal(self.scale * (value - self.zero()))
        v = round(v, 2)
        return v

    def encode_float(self, value: float) -> int:
        if not isinstance(value, float):
            raise TypeError('value is not float')
        return self.clamp(value, round(value / self.scale) + self.zero())

class ExpScale(ValueEncoding):
    """Exponential scale for parameters."""
    scale: float

    def __init__(self, name: str, scale: float) -> None:
        super(ExpScale, self).__init__(name)
        if not isinstance(scale, float):
            raise TypeError('scale is not float')
        self.scale = scale

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
        return self.clamp(value, round(math.log(value / self.scale, EXPONENT)))

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

OPCODE_REPEAT = 0
OPCODE_ENDREPEAT = 1
OPCODE_POP = 2

OPCODE_ENCODING = 3

def node(*names: str) -> Callable[[Opcode], Opcode]:
    def wrapped(arg: Opcode) -> Opcode:
        for name in names:
            global OPCODE_ENCODING
            if name in OPCODES:
                raise Exception('duplicate opcode: {!r}'.format(name))
            OPCODES[name] = (OPCODE_ENCODING, arg)
            OPCODE_ENCODING += 1
        return arg
    return wrapped

class RepeatContext:
    """Context manager for managing a repeat block."""
    context: ProgramContext

    def __init__(self, context: ProgramContext) -> None:
        self.context = context

    def __enter__(self) -> None:
        pass

    def __exit__(self, exc_type: Optional[Type[BaseException]],
                 exc_val: Optional[BaseException],
                 exc_tb: TracebackType) -> None:
        if exc_type is None:
            self.context.in_repeat = False
            self.context.writer.write((OPCODE_ENDREPEAT,))

class ProgramContext:
    writer: Writer
    in_repeat: bool

    def __init__(self) -> None:
        self.writer = Writer()
        self.in_repeat = False

    def __getattr__(self, name: str) -> Callable[..., Any]:
        try:
            encoding, opcode = OPCODES[name]
        except KeyError:
            raise AttributeError('no such opcode: {!r}'.format(name))
        def f(**kwargs: Dict[Any, Any]) -> None:
            self.writer.write((encoding,))
            opcode(self.writer, **kwargs) # type: ignore
        return f

    def repeat(self, count: int) -> RepeatContext:
        if self.in_repeat:
            raise Exception('cannot nest repeats')
        if not isinstance(count, int):
            raise TypeError('repeat is not an int')
        if not (2 <= count <= NUM_VALUES):
            raise ValueError('invalid repeat count')
        self.in_repeat = True
        self.writer.write((OPCODE_REPEAT, count - 1))
        return RepeatContext(self)

    def pop(self) -> None:
        self.writer.write((OPCODE_POP,))

################################################################################
# Definitions
################################################################################

GainValue = ExpScale('gain', 1.0)
TimeValue = ExpScale('time', 20.0)
FrequencyValue = ExpScale('frequency', 20e3)
DetuneValue = ExpScale('detune', 99.0/2.0)
IntValue = LinScale('int', 1.0, True)
PanValue = LinScale('int', 1/60, True)

Default = ParameterType('Default')()
GConst = ParameterType('GConst', GainValue)
TConst = ParameterType('TConst', TimeValue)
FConst = ParameterType('FConst', FrequencyValue)
DBConst = ParameterType('DBConst', IntValue)
PanConst = ParameterType('PanConst', PanValue)
GADSR = ParameterType('GADSR', TimeValue, TimeValue, GainValue, TimeValue)
FADSR = ParameterType(
    'FADSR', FrequencyValue, FrequencyValue,
    TimeValue, TimeValue, GainValue, TimeValue)
Note = ParameterType('Note', IntValue)
RandomBipolar = ParameterType('RandomBipolar', DetuneValue)

@node('gain')
def node_gain(w: Writer, *, gain: Parameter = Default) -> None:
    if not isinstance(gain, Parameter):
        raise TypeError('gain is not Parameter')
    gain.write(w)

@node('pan')
def node_pan(w: Writer, *, pan: Parameter = Default) -> None:
    if not isinstance(pan, Parameter):
        raise TypeError('pan is not a parameter')
    pan.write(w)

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
            q=DBConst(4.0),
        )
    c.sawtooth(
        frequency=Note(0),
    )

@instrument('Dance Bass')
def dance_bass(c: ProgramContext) -> None:
    c.gain(
        gain=GADSR(0.01, 0.5, 0.2, 0.1)
    )
    c.lowpass(
        frequency=FADSR(100, 6000, MIN, 0.2, 0.2, 0.2),
        q=DBConst(0),
    )
    c.gain(
        gain=GConst(0.5),
    )
    c.square(
        frequency=Note(-12),
    )
    c.pan(
        pan=PanConst(-0.5),
    )
    c.sawtooth(
        frequency=Note(0),
        detune=RandomBipolar(10.0),
    )
    c.pop()
    c.pan(
        pan=PanConst(+0.5),
    )
    c.sawtooth(
        frequency=Note(0),
        detune=RandomBipolar(10.0),
    )

@instrument('Soft Lead')
def soft_lead(c: ProgramContext) -> None:
    c.gain(
        gain=GADSR(0.050, 0.4, 0.3, 1.7),
    )
    for _ in range(2):
        c.lowpass(
            frequency=FADSR(600, 6000, 0.17, 0.4, 0.3, 1.0),
            q=DBConst(-6.0),
        )
    with c.repeat(5):
        c.pan(
            pan=RandomBipolar(0.5),
        )
        c.sawtooth(
            frequency=Note(0),
            detune=RandomBipolar(10.0),
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
        frequency=Note(0),
    )

################################################################################

def compile(func: Callable[[ProgramContext], None]) -> bytes:
    c = ProgramContext()
    func(c)
    if c.in_repeat:
        raise Exception('unterminated repeat')
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
