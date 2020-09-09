import {
  GRAIN_NUMBER_TAG_TYPE,
  GRAIN_GENERIC_HEAP_TAG_TYPE,

  GRAIN_NUMBER_TAG_MASK,
  GRAIN_GENERIC_TAG_MASK,

  GRAIN_BOXED_NUM_HEAP_TAG,
  GRAIN_FLOAT32_BOXED_NUM_TAG,
  GRAIN_FLOAT64_BOXED_NUM_TAG,
  GRAIN_INT32_BOXED_NUM_TAG,
  GRAIN_INT64_BOXED_NUM_TAG,
  GRAIN_RATIONAL_BOXED_NUM_TAG,
} from './ascutils/tags'

import {
  GRAIN_ERR_OVERFLOW,
  GRAIN_ERR_DIVISION_BY_ZERO,
  GRAIN_ERR_NOT_INTLIKE
} from './ascutils/errors'

import {
  GRAIN_TRUE,
  GRAIN_FALSE,
} from './ascutils/primitives'

import { throwError } from './ascutils/grainRuntime'

import {
  newRational,
  newInt32,
  newInt64,
  newFloat32,
  newFloat64
} from './ascutils/dataStructures'


// @ts-ignore: decorator
@inline
function throwOverflowError(): u32 {
  return throwError(GRAIN_ERR_OVERFLOW, 0, 0)
}

// @ts-ignore: decorator
@inline
function throwDivideByZero(): u32 {
  return throwError(GRAIN_ERR_DIVISION_BY_ZERO, 0, 0)
}

// @ts-ignore: decorator
@inline
function throwNotIntLike(x: u32): u32 {
  return throwError(GRAIN_ERR_NOT_INTLIKE, x, 0)
}

// @ts-ignore: decorator
@inline
function encodeBool(b: bool): u32 {
  return b ? GRAIN_TRUE : GRAIN_FALSE
}

// @ts-ignore: decorator
@inline
function boxSimple(x: i32): u32 {
  return x << 1
}

// @ts-ignore: decorator
@inline
function unboxSimple(x: u32): i32 {
  return <i32>(x) >> 1
}

// @ts-ignore: decorator
@inline
function safeI64toI32(x: i64): i32 {
  if (x > I32.MAX_VALUE || x < I32.MIN_VALUE) {
    return throwOverflowError()
  } else {
    return <i32>(x)
  }
}

// Make fun of me all you want, but this is taken from
// https://en.wikipedia.org/wiki/Binary_GCD_algorithm
// [TODO] Make sure it's okay that x & y are signed
function gcd(x: i64, y: i64): i64 {
  if (x == y) {
    return y
  }
  if (x == 0) {
    return y
  }
  if (y == 0) {
    return x
  }
  if ((~x & 1) != 0) {
    // x is even
    if ((y & 1) != 0) {
      // y is odd
      return gcd(x >> 1, y)
    } else {
      return gcd(x >> 1, y >> 1) << 1
    }
  }
  if ((~y & 1) != 0) {
    // y is even and x is odd
    return gcd(x, y >> 1)
  }
  if (x > y) {
    return gcd(x - y, y)
  }
  return gcd(y - x, x)
}

function gcd32(x: i32, y: i32): i32 {
  return <i32>(gcd(<i64>(x), <i64>(y)))
}


function reducedFraction(x: i32, y: i32): u32 {
  if (x < 0 && y < 0) {
    // Normalization 1: Never do negative/negative
    x = -x
    y = -y
  }
  if (y == 0) {
    return throwDivideByZero()
  }
  if (x % y == 0) {
    // Avoid allocation if possible
    return reducedInteger(<i64>(x) / <i64>(y))
  }
  // x not evenly divisible by y
  let factor = gcd32(x, y)
  return newRational(x / factor, y / factor)
}

function reducedFraction64(x: i64, y: i64): u32 {
  if (x < 0 && y < 0) {
    x = -x
    y = -y
  }
  if (y == 0) {
    return throwDivideByZero()
  }
  if (x % y == 0) {
    return reducedInteger(x / y)
  }
  let factor = gcd(x, y)
  let xdiv = safeI64toI32(x / factor)
  let ydiv = safeI64toI32(y / factor)
  return newRational(xdiv, ydiv)
}

// @ts-ignore: decorator
@inline
function reducedInteger(x: i64): u32 {
  if ((x > I32.MAX_VALUE) || (x < I32.MIN_VALUE)) {
    return newInt64(x)
  } else if ((x > (I32.MAX_VALUE >> 1)) || (x < (I32.MIN_VALUE >> 1))) {
    return newInt32(<i32>(x))
  } else {
    return boxSimple(<i32>(x))
  }
}

// @ts-ignore: decorator
@inline
function safeI32Multiply(x: i32, y: i32): i32 {
  let prod = <i64>(x) * <i64>(y)
  if (prod > I32.MAX_VALUE || prod < I32.MIN_VALUE) {
    return throwOverflowError()
  }
  return <i32>(prod);
}

// @ts-ignore: decorator
@inline
function safeI64Multiply(x: i64, y: i64): i64 {
  let prod = x * y
  if (x != 0 && prod / x != y) {
    return throwOverflowError()
  }
  return prod;
}

// Accessor functions (Binaryen should inline these)

/* Memory Layout:
 * [GRAIN_BOXED_NUM_HEAP_TAG : u32, <boxed_num tag> : u32, <number-specific payload>...]
 * (payload depends on boxed_num tag...see below)
 *
 * Payloads:
 * For Int32:
 * [number: i32]
 *
 * For Int64:
 * [number: i32]
 *
 * For Float32:
 * [number: f32]
 *
 * For Float64:
 * [number: f64]
 *
 * For Rational:
 * [numerator: i32, denominator: u32]
 */

// @ts-ignore: decorator
@inline
function boxedNumberTag(xptr: u32): u32 {
  return load<u32>(xptr, 1 * 4)
}

// @ts-ignore: decorator
@inline
function boxedInt32Number(xptr: u32): i32 {
  return load<i32>(xptr, 2 * 4)
}

// @ts-ignore: decorator
@inline
function boxedInt64Number(xptr: u32): i64 {
  return load<i64>(xptr, 2 * 4)
}

// @ts-ignore: decorator
@inline
function boxedFloat32Number(xptr: u32): f32 {
  return load<f32>(xptr, 2 * 4)
}

// @ts-ignore: decorator
@inline
function boxedFloat64Number(xptr: u32): f64 {
  return load<f64>(xptr, 2 * 4)
}

// @ts-ignore: decorator
@inline
function boxedRationalNumerator(xptr: u32): i32 {
  return load<i32>(xptr, 2 * 4)
}

// @ts-ignore: decorator
@inline
function boxedRationalDenominator(xptr: u32): u32 {
  return load<u32>(xptr, 3 * 4)
}



function coerceFloat32(x: u32): f32 {
  if (isSimpleNumber(x)) {
    return <f32>(unboxSimple(x))
  }
  let xtag = boxedNumberTag(x)
  switch (xtag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      return <f32>(boxedInt32Number(x))
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      return <f32>(boxedInt64Number(x))
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      return <f32>(boxedRationalNumerator(x)) / <f32>(boxedRationalDenominator(x))
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      return boxedFloat32Number(x)
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      return <f32>(boxedFloat64Number(x))
    } default: {
      return 0.0
    }
  }
}

function coerceFloat64(x: u32): f64 {
  if (isSimpleNumber(x)) {
    return <f64>(unboxSimple(x))
  }
  let xtag = boxedNumberTag(x)
  switch (xtag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      return <f64>(boxedInt32Number(x))
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      return <f64>(boxedInt64Number(x))
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      return <f64>(boxedRationalNumerator(x)) / <f32>(boxedRationalDenominator(x))
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      return <f64>(boxedFloat32Number(x))
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      return boxedFloat64Number(x)
    } default: {
      return 0.0
    }
  }
}

function coerceInt64(x: u32): i64 {
  if (isSimpleNumber(x)) {
    return <i64>(unboxSimple(x))
  }
  let xtag = boxedNumberTag(x)
  switch (xtag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      return <i64>(boxedInt32Number(x))
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      return boxedInt64Number(x)
    } default: {
      // rationals are never integral, and we refuse to coerce floats to ints
      return throwNotIntLike(x)
    }
  }
}

// @ts-ignore: decorator
@inline
function isSimpleNumber(x: u32): bool {
  return (x & GRAIN_NUMBER_TAG_MASK) == GRAIN_NUMBER_TAG_TYPE
}

// @ts-ignore: decorator
@inline
function isBoxedNumber(x: u32): bool {
  return ((x & GRAIN_GENERIC_TAG_MASK) == GRAIN_GENERIC_HEAP_TAG_TYPE) &&
    ((load<u32>(x ^ GRAIN_GENERIC_HEAP_TAG_TYPE) == GRAIN_BOXED_NUM_HEAP_TAG))
}

// @ts-ignore: decorator
@inline
export function isNumber(x: u32): bool {
  // x is a number if it is a literal number or a boxed_num heap value
  return isSimpleNumber(x) || isBoxedNumber(x)
}

/** Number-aware equality checking
  * The basic idea is that we first figure out the type of the
  * number on the LHS, and then figure out if the RHS number is equal
  * to that number
  *
  * NOTE: The preconditions in these functions are important, so do NOT
  *       export them!
  */

function numberEqualSimpleHelp(x: u32, y: u32): bool {
  // PRECONDITION: x is a "simple" number (value tag is 0) and x !== y and isNumber(y)
  // We know y is a heap number, so let's not beat around the bush
  let xval = x >> 1 // <- actual int value of x
  let yBoxedNumberTag = boxedNumberTag(y)
  switch (yBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt32Number(y)
      return <i32>(xval) == yBoxedVal
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt64Number(y)
      return <i64>(xval) == yBoxedVal
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      // NOTE: we always store in most reduced form, so a rational and an int are never equal
      return false
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat32Number(y)
      return F32.isSafeInteger(yBoxedVal) && <i64>(xval) == <i64>(yBoxedVal)
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat64Number(y)
      return F64.isSafeInteger(yBoxedVal) && <i64>(xval) == <i64>(yBoxedVal)
    } default: {
      // ideally we should trap or something here
      return false
    }
  }
}


function numberEqualInt64Help(xBoxedVal: i64, y: u32): bool {
  // PRECONDITION: x !== y and isNumber(y)
  // Basic number:
  if ((y & GRAIN_NUMBER_TAG_MASK) == GRAIN_NUMBER_TAG_TYPE) {
    return xBoxedVal == <i64>(y >> 1)
  }
  // Boxed number:
  let yBoxedNumberTag = boxedNumberTag(y)
  switch (yBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt32Number(y)
      return xBoxedVal == <i64>(yBoxedVal)
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt64Number(y)
      return xBoxedVal == yBoxedVal
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      // NOTE: we always store in most reduced form, so a rational and an int are never equal
      return false
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat32Number(y)
      return F32.isSafeInteger(yBoxedVal) && xBoxedVal == <i64>(yBoxedVal)
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat64Number(y)
      return F64.isSafeInteger(yBoxedVal) && xBoxedVal == <i64>(yBoxedVal)
    } default: {
      // ideally we should trap or something here
      return false
    }
  }
}

function numberEqualInt32Help(xBoxedVal: i32, y: u32): bool {
  // We can just pretend it's 64-bit for the equality check
  return numberEqualInt64Help(<i64>(xBoxedVal), y)
}

function numberEqualRationalHelp(xptr: u32, y: u32): bool {
  // PRECONDITION: x is rational and x !== y and isNumber(y)
  // Basic number: (we know it's not equal, since we never store ints as rationals)
  if ((y & GRAIN_NUMBER_TAG_MASK) == GRAIN_NUMBER_TAG_TYPE) {
    return false
  }
  let xNumerator = boxedRationalNumerator(xptr)
  let xDenominator = boxedRationalDenominator(xptr)
  // Boxed number:
  let yBoxedNumberTag = boxedNumberTag(y)
  switch (yBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      return false
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      return false
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      let yNumerator = boxedRationalNumerator(y)
      let yDenominator = boxedRationalDenominator(y)
      return (xNumerator == yNumerator) && (xDenominator == yDenominator)
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat32Number(y)
      let xAsFloat = <f64>(xNumerator) / <f64>(xDenominator)
      // [TODO] maybe we should have some sort of tolerance?
      return xAsFloat == yBoxedVal
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat64Number(y)
      let xAsFloat = <f64>(xNumerator) / <f64>(xDenominator)
      // [TODO] maybe we should have some sort of tolerance?
      return xAsFloat == yBoxedVal
    } default: {
      // ideally we should trap or something here
      return false
    }
  }
}

function numberEqualFloat64Help(x: f64, y: u32): bool {
  let xIsInteger = F64.isInteger(x)
  // Basic number:
  if ((y & GRAIN_NUMBER_TAG_MASK) == GRAIN_NUMBER_TAG_TYPE) {
    return xIsInteger && x == <f64>(y >> 1)
  }
  // Boxed number
  let yBoxedNumberTag = boxedNumberTag(y)
  switch (yBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt32Number(y)
      return F64.isSafeInteger(x) && <i64>(x) == <i64>(yBoxedVal)
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt64Number(y)
      return F64.isSafeInteger(x) && <i64>(x) == yBoxedVal
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      let yNumerator = boxedRationalNumerator(y)
      let yDenominator = boxedRationalDenominator(y)
      let yAsFloat = <f64>(yNumerator) / <f64>(yDenominator)
      return x == yAsFloat
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat32Number(y)
      // [TODO] maybe we should have some sort of tolerance?
      return x == <f64>(yBoxedVal)
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat64Number(y)
      // [TODO] maybe we should have some sort of tolerance?
      return x == yBoxedVal
    } default: {
      // ideally we should trap or something here
      return false
    }
  }
}

function numberEqualFloat32Help(x: f32, y: u32): bool {
  return numberEqualFloat64Help(<f64>(x), y)
}

export function numberEqual(x: u32, y: u32): bool {
  // Short circuit if value/pointer is the same
  if (x === y) return true
  if (!isNumber(x)) return false
  if (!isNumber(y)) return false
  if ((x & GRAIN_NUMBER_TAG_MASK) == GRAIN_NUMBER_TAG_TYPE) {
    return numberEqualSimpleHelp(x, y)
  }
  // Boxed number
  let xBoxedNumberTag = boxedNumberTag(x)
  switch (xBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      let xBoxedVal = boxedInt32Number(x)
      return numberEqualInt32Help(xBoxedVal, y)
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      let xBoxedVal = boxedInt64Number(x)
      return numberEqualInt64Help(xBoxedVal, y)
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      return numberEqualRationalHelp(x, y)
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      return numberEqualFloat32Help(boxedFloat32Number(x), y)
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      return numberEqualFloat64Help(boxedFloat64Number(x), y)
    } default: {
      // ideally we should trap or something here
      return false
    }
  }
}

/*
 * ===== PLUS & MINUS =====
 * (same schema as equal())
 */

function numberPlusMinusSimpleHelp(x: u32, y: u32, isMinus: bool): u32 {
  // PRECONDITION: x is a "simple" number (value tag is 0) and isNumber(y)
  if (isSimpleNumber(y)) {
    return reducedInteger(<i64>(unboxSimple(x)) + <i64>(unboxSimple(y) * (isMinus ? -1 : 1)))
  }
  let xval = unboxSimple(x) // <- actual int value of x
  let yBoxedNumberTag = boxedNumberTag(y)
  switch (yBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt32Number(y) * (isMinus ? -1 : 1)
      return reducedInteger(<i64>(xval) + <i64>(yBoxedVal))
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt64Number(y) * (isMinus ? -1 : 1)
      let xval64 = <i64>(xval)
      let sum = xval64 + yBoxedVal
      if (yBoxedVal >= 0 && sum < xval64) {
        return throwOverflowError()
      } else if (yBoxedVal < 0 && sum > xval64) {
        return throwOverflowError()
      } else {
        return reducedInteger(sum)
      }
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      // NOTE: we always store in most reduced form, so a rational and an int are never equal
      let yNumerator = boxedRationalNumerator(y) * (isMinus ? -1 : 1)
      let yDenominator = boxedRationalDenominator(y)
      let expandedXNumerator = safeI64Multiply(<i64>(xval), yDenominator)
      let sum = <i64>(expandedXNumerator) + <i64>(yNumerator)
      if (sum < I32.MIN_VALUE || sum > I32.MAX_VALUE) {
        return throwOverflowError()
      }
      return reducedFraction64(sum, <i64>(yDenominator))
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat32Number(y) * (isMinus ? -1.0 : 1.0)
      // [TODO] is this safe?
      return newFloat32(<f32>(xval) + yBoxedVal)
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat64Number(y) * <f64>(isMinus ? -1.0 : 1.0)
      return newFloat64(<f64>(xval) + yBoxedVal)
    } default: {
      // ideally we should trap or something here
      return 0xF00BAE
    }
  }
}

function numberPlusMinusInt64Help(xval: i64, y: u32, isMinus: bool): u32 {
  // PRECONDITION: x is a "simple" number (value tag is 0) and isNumber(y)
  if (isSimpleNumber(y)) {
    return reducedInteger(<i64>(xval) + <i64>(unboxSimple(y) * (isMinus ? -1 : 1)))
  }
  let yBoxedNumberTag = boxedNumberTag(y)
  switch (yBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt32Number(y) * (isMinus ? -1 : 1)
      return reducedInteger(xval + <i64>(yBoxedVal))
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt64Number(y) * (isMinus ? -1 : 1)
      let xval64 = xval
      let sum = xval64 + yBoxedVal
      if (yBoxedVal >= 0 && sum < xval64) {
        return throwOverflowError()
      } else if (yBoxedVal < 0 && sum > xval64) {
        return throwOverflowError()
      } else {
        return reducedInteger(sum)
      }
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      // NOTE: we always store in most reduced form, so a rational and an int are never equal
      let yNumerator = boxedRationalNumerator(y) * (isMinus ? -1 : 1)
      let yDenominator = boxedRationalDenominator(y)
      let expandedXNumerator = safeI64Multiply(xval, yDenominator)
      let sum = expandedXNumerator + <i64>(yNumerator)
      if (sum < I32.MIN_VALUE || sum > I32.MAX_VALUE) {
        return throwOverflowError()
      }
      return reducedFraction64(sum, <i64>(yDenominator))
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat32Number(y) * (isMinus ? -1.0 : 1.0)
      // [TODO] is this safe?
      return newFloat32(<f32>(xval) + yBoxedVal)
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat64Number(y) * <f64>(isMinus ? -1.0 : 1.0)
      return newFloat64(<f64>(xval) + yBoxedVal)
    } default: {
      // ideally we should trap or something here
      return 0xF00BAE
    }
  }
}

function numberPlusMinusRationalHelp(x: u32, y: u32, isMinus: bool): u32 {
  if (isSimpleNumber(y)) {
    return numberPlusMinusSimpleHelp(y, x, isMinus)
  }
  let ytag = boxedNumberTag(y)
  switch (ytag) {
    case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      // The one case we don't delegate is rational +/- rational
      let xNumerator = boxedRationalNumerator(x)
      let xDenominator = boxedRationalDenominator(x)
      let yNumerator = boxedRationalNumerator(y) * (isMinus ? -1 : 1)
      let yDenominator = boxedRationalDenominator(y)
      // [TODO] this could be written in a more overflow-proof way
      if (xDenominator == yDenominator) {
        return reducedFraction64(<i64>(xNumerator) + <i64>(yNumerator), xDenominator)
      }
      let numerator1 = safeI64Multiply(xNumerator, yDenominator)
      let numerator2 = safeI64Multiply(yNumerator, xDenominator)
      let numerator = numerator1 + numerator2
      let denominator = safeI64Multiply(xDenominator, yDenominator)
      return reducedFraction64(numerator, denominator)
    } case GRAIN_INT32_BOXED_NUM_TAG:
    case GRAIN_INT64_BOXED_NUM_TAG:
    case GRAIN_FLOAT32_BOXED_NUM_TAG:
    case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      return numberPlusMinusHelp(y, x, isMinus)
    } default: {
      // should trap instead
      return 0xF00BAE
    }
  }
}


function numberPlusMinusFloat32Help(xval: f32, y: u32, isMinus: bool): u32 {
  if (!isSimpleNumber(y) && boxedNumberTag(y) == GRAIN_FLOAT64_BOXED_NUM_TAG) {
    // Special case: promote to f64 if RHS is f64
    let yval = boxedFloat64Number(y) * <f64>(isMinus ? -1.0 : 1.0)
    return newFloat64(<f64>(xval) + yval)
  } else {
    let yval = coerceFloat32(y) * (isMinus ? -1.0 : 1.0)
    return newFloat32(xval + yval)
  }
}

function numberPlusMinusFloat64Help(xval: f64, y: u32, isMinus: bool): u32 {
  let yval = coerceFloat64(y) * <f64>(isMinus ? -1.0 : 1.0)
  return newFloat64(xval + yval)
}


function numberPlusMinusInt32Help(xval: i32, y: u32, isMinus: bool): u32 {
  return numberPlusMinusInt64Help(<i64>(xval), y, isMinus)
}

function numberPlusMinusHelp(x: u32, y: u32, isMinus: bool): u32 {
  if (isSimpleNumber(x)) {
    return numberPlusMinusSimpleHelp(x, y, isMinus)
  }
  let xtag = boxedNumberTag(x)
  switch (xtag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      return numberPlusMinusInt32Help(boxedInt32Number(x), y, isMinus)
    }
    case GRAIN_INT64_BOXED_NUM_TAG: {
      return numberPlusMinusInt64Help(boxedInt64Number(x), y, isMinus)
    }
    case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      return numberPlusMinusRationalHelp(x, y, isMinus)
    }
    case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      return numberPlusMinusFloat32Help(boxedFloat32Number(x), y, isMinus)
    }
    case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      return numberPlusMinusFloat64Help(boxedFloat64Number(x), y, isMinus)
    }
    default: {
      return 0xF000BAE
    }
  }
}

export function numberPlus(x: u32, y: u32): u32 {
  return numberPlusMinusHelp(x, y, false)
}

export function numberMinus(x: u32, y: u32): u32 {
  return numberPlusMinusHelp(x, y, true)
}

/*
 * ===== TIMES & DIVIDE =====
 * (same schema as equal())
 */

function numberTimesDivideSimpleHelp(x: u32, y: u32, isDivide: bool): u32 {
  // PRECONDITION: x is a "simple" number (value tag is 0) and isNumber(y)
  let xval = unboxSimple(x) // <- actual int value of x
  return numberTimesDivideInt64Help(xval, y, isDivide)
}

function numberTimesDivideInt32Help(xval: i32, y: u32, isDivide: bool): u32 {
  return numberTimesDivideInt64Help(<i64>(xval), y, isDivide)
}

function numberTimesDivideInt64Help(xval: i64, y: u32, isDivide: bool): u32 {
  // PRECONDITION: x is a "simple" number (value tag is 0) and isNumber(y)
  if (isSimpleNumber(y)) {
    if (isDivide) {
      return reducedFraction64(xval, <i64>(unboxSimple(y)))
    } else {
      return reducedInteger(safeI64Multiply(xval, <i64>(unboxSimple(y))))
    }
  }
  let yBoxedNumberTag = boxedNumberTag(y)
  switch (yBoxedNumberTag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt32Number(y)
      if (isDivide) {
        return reducedFraction64(xval, <i64>(yBoxedVal))
      } else {
        return reducedInteger(safeI64Multiply(xval, <i64>(yBoxedVal)))
      }
    } case GRAIN_INT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedInt64Number(y)
      if (isDivide) {
        return reducedFraction64(xval, yBoxedVal)
      } else {
        return reducedInteger(safeI64Multiply(xval, yBoxedVal))
      }
    } case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      // NOTE: we always store in most reduced form, so a rational and an int are never equal
      let yNumerator = boxedRationalNumerator(y)
      let yDenominator = boxedRationalDenominator(y)
      if (isDivide) {
        // x / (a / b) == (x * b) / a
        let numerator = safeI64Multiply(xval, yDenominator)
        return reducedFraction64(numerator, yNumerator)
      } else {
        // x * (a / b) == (x * a) / b
        let numerator = safeI64Multiply(xval, yNumerator)
        return reducedFraction64(numerator, yDenominator)
      }
    } case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat32Number(y)
      // [TODO] is this safe?
      if (isDivide) {
        return newFloat32(<f32>(xval) / yBoxedVal)
      } else {
        return newFloat32(<f32>(xval) * yBoxedVal)
      }
    } case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let yBoxedVal = boxedFloat64Number(y)
      if (isDivide) {
        return newFloat64(<f64>(xval) / yBoxedVal)
      } else {
        return newFloat64(<f64>(xval) * yBoxedVal)
      }
    } default: {
      // ideally we should trap or something here
      return 0xF00BAE
    }
  }
}

function numberTimesDivideRationalHelp(x: u32, y: u32, isDivide: bool): u32 {
  // Division isn't commutative, so we actually need to do the work
  let xNumerator = boxedRationalNumerator(x)
  let xDenominator = boxedRationalDenominator(x)
  if (isSimpleNumber(y)) {
    if (isDivide) {
      // (a / b) / y == a / (b * y)
      let denominator = safeI64Multiply(xDenominator, <i64>(unboxSimple(y)))
      return reducedFraction64(xNumerator, denominator)
    } else {
      // (a / b) * y == (a * y) / b
      let numerator = safeI64Multiply(xNumerator, <i64>(unboxSimple(y)))
      return reducedFraction64(numerator, xDenominator)
    }
  }
  let ytag = boxedNumberTag(y)
  switch (ytag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      // Same idea as above
      if (isDivide) {
        // (a / b) / y == a / (b * y)
        let denominator = safeI64Multiply(xDenominator, <i64>(boxedInt32Number(y)))
        return reducedFraction64(xNumerator, denominator)
      } else {
        // (a / b) * y == (a * y) / b
        let numerator = safeI64Multiply(xNumerator, <i64>(boxedInt32Number(y)))
        return reducedFraction64(numerator, xDenominator)
      }
    }
    case GRAIN_INT64_BOXED_NUM_TAG: {
      // Same idea as above
      if (isDivide) {
        // (a / b) / y == a / (b * y)
        let denominator = safeI64Multiply(xDenominator, boxedInt64Number(y))
        return reducedFraction64(xNumerator, denominator)
      } else {
        // (a / b) * y == (a * y) / b
        let numerator = safeI64Multiply(xNumerator, boxedInt64Number(y))
        return reducedFraction64(numerator, xDenominator)
      }
    }
    case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      let xNumerator = boxedRationalNumerator(x)
      let xDenominator = boxedRationalDenominator(x)
      let yNumerator = boxedRationalNumerator(y)
      let yDenominator = boxedRationalDenominator(y)
      // (a / b) * (c / d) == (a * c) / (b * d)
      // (a / b) / (c / d) == (a * d) / (b * c)
      // [TODO] this could maybe be written in a more overflow-proof way
      let numerator = isDivide ? safeI64Multiply(xNumerator, yDenominator) : safeI64Multiply(xNumerator, yNumerator)
      let denominator = isDivide ? safeI64Multiply(xDenominator, yNumerator) : safeI64Multiply(xDenominator, yDenominator)
      return reducedFraction64(numerator, denominator)
    }
    case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      let asFloat = <f32>(xNumerator) / <f32>(xDenominator)
      if (isDivide) {
        return newFloat32(asFloat / boxedFloat32Number(y))
      } else {
        return newFloat32(asFloat * boxedFloat32Number(y))
      }
    }
    case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      let asFloat = <f64>(xNumerator) / <f64>(xDenominator)
      if (isDivide) {
        return newFloat64(asFloat / boxedFloat64Number(y))
      } else {
        return newFloat64(asFloat * boxedFloat64Number(y))
      }
    } default: {
      // should trap instead
      return 0xF00BAE
    }
  }
}

function numberTimesDivideFloat64Help(x: f64, y: u32, isDivide: bool): u32 {
  let yAsFloat = coerceFloat64(y)
  if (isDivide) {
    return newFloat64(x / yAsFloat)
  } else {
    return newFloat64(x * yAsFloat)
  }
}

function numberTimesDivideFloat32Help(x: f32, y: u32, isDivide: bool): u32 {
  if (isBoxedNumber(y) && boxedNumberTag(y) == GRAIN_INT64_BOXED_NUM_TAG) {
    // Special case: f32->f64 promotion
    if (isDivide) {
      return newFloat64(<f64>(x) / boxedFloat64Number(y))
    } else {
      return newFloat64(<f64>(x) * boxedFloat64Number(y))
    }
  }
  let yAsFloat = coerceFloat32(y)
  if (isDivide) {
    return newFloat32(x / yAsFloat)
  } else {
    return newFloat32(x * yAsFloat)
  }
}

function numberTimesDivideHelp(x: u32, y: u32, isDivide: bool): u32 {
  if (isSimpleNumber(x)) {
    return numberTimesDivideSimpleHelp(x, y, isDivide)
  }
  let xtag = boxedNumberTag(x)
  switch (xtag) {
    case GRAIN_INT32_BOXED_NUM_TAG: {
      return numberTimesDivideInt32Help(boxedInt32Number(x), y, isDivide)
    }
    case GRAIN_INT64_BOXED_NUM_TAG: {
      return numberTimesDivideInt64Help(boxedInt64Number(x), y, isDivide)
    }
    case GRAIN_RATIONAL_BOXED_NUM_TAG: {
      return numberTimesDivideRationalHelp(x, y, isDivide)
    }
    case GRAIN_FLOAT32_BOXED_NUM_TAG: {
      return numberTimesDivideFloat32Help(boxedFloat32Number(x), y, isDivide)
    }
    case GRAIN_FLOAT64_BOXED_NUM_TAG: {
      return numberTimesDivideFloat64Help(boxedFloat64Number(x), y, isDivide)
    }
    default: {
      return 0xF000BAE
    }
  }
}

export function numberTimes(x: u32, y: u32): u32 {
  return numberTimesDivideHelp(x, y, false)
}

export function numberDivide(x: u32, y: u32): u32 {
  return numberTimesDivideHelp(x, y, true)
}

/*
 * ===== MODULO =====
 * (same schema as equal())
 */

export function numberMod(x: u32, y: u32): u32 {
  let xval = coerceInt64(x)
  let yval = coerceInt64(y)
  return reducedInteger(xval % yval)
}

/*
 * ===== LESS THAN / GREATER THAN / LESS EQUAL / GREATER EQUAL =====
 * Coerce to float64 and then do comparisons
 * [TODO] Could probably be made more efficient
 */
// [TODO] is this safe? I think it's safe?
export function numberLess(x: u32, y: u32): u32 {
  let xval = coerceFloat64(x)
  let yval = coerceFloat64(y)
  return encodeBool(xval < yval)
}

export function numberGreater(x: u32, y: u32): u32 {
  let xval = coerceFloat64(x)
  let yval = coerceFloat64(y)
  return encodeBool(xval > yval)
}

export function numberLessEqual(x: u32, y: u32): u32 {
  // Equality is finicky, so delegate
  let xval = coerceFloat64(x)
  let yval = coerceFloat64(y)
  if (xval < yval) {
    return encodeBool(true)
  } else {
    return encodeBool(numberEqual(x, y))
  }
}

export function numberGreaterEqual(x: u32, y: u32): u32 {
  // Equality is finicky, so delegate
  let xval = coerceFloat64(x)
  let yval = coerceFloat64(y)
  if (xval > yval) {
    return encodeBool(true)
  } else {
    return encodeBool(numberEqual(x, y))
  }
}

/*
 * ===== EQUAL =====
 */

export function numberEq(x: u32, y: u32): u32 {
  return encodeBool(numberEqual(x, y))
}

/*
 * ===== LOGICAL OPERATIONS =====
 * Only valid for int-like numbers. Coerce to i64 and do operations
 */

export function numberLsl(x: u32, y: u32): u32 {
  let xval = coerceInt64(x)
  let yval = coerceInt64(y)
  return reducedInteger(x << y)
}

export function numberLsr(x: u32, y: u32): u32 {
  let xval = coerceInt64(x)
  let yval = coerceInt64(y)
  return reducedInteger(x >> y)
}

export function numberLand(x: u32, y: u32): u32 {
  let xval = coerceInt64(x)
  let yval = coerceInt64(y)
  return reducedInteger(x & y)
}

export function numberLor(x: u32, y: u32): u32 {
  let xval = coerceInt64(x)
  let yval = coerceInt64(y)
  return reducedInteger(x | y)
}

export function numberLxor(x: u32, y: u32): u32 {
  let xval = coerceInt64(x)
  let yval = coerceInt64(y)
  return reducedInteger(x ^ y)
}

export function numberAsr(x: u32, y: u32): u32 {
  let xval = coerceInt64(x)
  let yval = coerceInt64(y)
  return reducedInteger(x >>> y)
}
