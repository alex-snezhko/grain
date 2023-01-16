/* Taken from OCaml's typing/typecore.ml module. Original copyright: */
/**************************************************************************/
/*                                                                        */
/*                                 OCaml                                  */
/*                                                                        */
/*             Xavier Leroy, projet Cristal, INRIA Rocquencourt           */
/*                                                                        */
/*   Copyright 1996 Institut National de Recherche en Informatique et     */
/*     en Automatique.                                                    */
/*                                                                        */
/*   All rights reserved.  This file is distributed under the terms of    */
/*   the GNU Lesser General Public License version 2.1, with the          */
/*   special exception on linking described in the file LICENSE.          */
/*                                                                        */
/**************************************************************************/
open Grain_parsing;
open Grain_utils;
open Parsetree;
open Types;
open Ctype;
open Builtin_types;

type type_forcing_context =
  | If_conditional
  | If_no_else_branch
  | Loop_conditional
  | Loop_body
  | Assert_condition
  | Sequence_left_hand_side
  | Assign_not_box
  | Assign_not_array
  | Assign_not_array_index;

type type_expected = {
  ty: type_expr,
  explanation: option(type_forcing_context),
};

type error = string;
exception Error(Location.error);

/*
   Saving and outputting type information.
   We keep these function names short, because they have to be
   called each time we create a record of type [Typedtree.expression]
   or [Typedtree.pattern] that will end up in the typed AST.
 */
let re = node =>
  /*Cmt_format.add_saved_type (Cmt_format.Partial_expression node);
    Stypes.record (Stypes.Ti_expr node);*/
  node;

let rp = node =>
  /*Cmt_format.add_saved_type (Cmt_format.Partial_pattern node);
    Stypes.record (Stypes.Ti_pat node);*/
  node;

let mk_expected = (~explanation=?, ty) => {ty, explanation};

let type_constant =
  fun
  | Const_number(_) => instance_def(Builtin_types.type_number)
  | Const_int32(_) => instance_def(Builtin_types.type_int32)
  | Const_int64(_) => instance_def(Builtin_types.type_int64)
  | Const_uint32(_) => instance_def(Builtin_types.type_uint32)
  | Const_uint64(_) => instance_def(Builtin_types.type_uint64)
  | Const_float32(_) => instance_def(Builtin_types.type_float32)
  | Const_float64(_) => instance_def(Builtin_types.type_float64)
  | Const_wasmi32(_) => instance_def(Builtin_types.type_wasmi32)
  | Const_wasmi64(_) => instance_def(Builtin_types.type_wasmi64)
  | Const_wasmf32(_) => instance_def(Builtin_types.type_wasmf32)
  | Const_wasmf64(_) => instance_def(Builtin_types.type_wasmf64)
  | Const_bigint(_) => instance_def(Builtin_types.type_bigint)
  | Const_rational(_) => instance_def(Builtin_types.type_rational)
  | Const_bool(_) => instance_def(Builtin_types.type_bool)
  | Const_void => instance_def(Builtin_types.type_void)
  | Const_bytes(_) => instance_def(Builtin_types.type_bytes)
  | Const_string(_) => instance_def(Builtin_types.type_string)
  | Const_char(_) => instance_def(Builtin_types.type_char);

let constant:
  (Location.t, Parsetree.constant) =>
  result(Asttypes.constant, Location.error) =
  (loc, c) =>
    switch (c) {
    | PConstNumber(PConstNumberInt(n)) =>
      switch (Literals.conv_number_int(n)) {
      | Some(n) => Ok(Const_number(Const_number_int(n)))
      | None =>
        switch (Literals.conv_bigint(n)) {
        | Some((bigint_negative, bigint_limbs)) =>
          Ok(
            Const_number(
              Const_number_bigint({
                bigint_negative,
                bigint_limbs,
                bigint_rep: n,
              }),
            ),
          )
        // Should not happen, since `None` is only returned for the empty string,
        // and that is disallowed by the lexer
        | None =>
          Error(
            Location.errorf(
              ~loc,
              "Unable to parse big-integer literal %st.",
              n,
            ),
          )
        }
      }
    | PConstNumber(PConstNumberFloat(n)) =>
      switch (Literals.conv_number_float(n)) {
      | Some(n) => Ok(Const_number(Const_number_float(n)))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Number literal %s is outside of the floating-point range of the Number type.",
            n,
          ),
        )
      }
    | PConstNumber(PConstNumberRational(n, d)) =>
      // TODO(#1168): allow arbitrary-length arguments in rational constants
      switch (Literals.conv_number_rational(n, d)) {
      | Some((n, d)) when d == 1l =>
        Ok(Const_number(Const_number_int(Int64.of_int32(n))))
      | Some((n, d)) =>
        // (until above TODO is done, we keep existing behavior and limit to 32-bits (see #1168))
        Ok(
          Const_number(
            Const_number_rational({
              rational_negative: Int32.compare(n, 0l) < 0, // true if rational is less than 0
              rational_num_limbs: [|Int64.abs(Int64.of_int32(n))|],
              rational_den_limbs: [|Int64.abs(Int64.of_int32(d))|],
              rational_num_rep: Int32.to_string(n),
              rational_den_rep: Int32.to_string(Int32.abs(d)),
            }),
          ),
        )
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Number literal %s/%s is outside of the rational number range of the Number type.",
            n,
            d,
          ),
        )
      }
    | PConstInt32(n) =>
      switch (Literals.conv_int32(n)) {
      | Some(n) => Ok(Const_int32(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Int32 literal %sl exceeds the range of representable 32-bit signed integers.",
            n,
          ),
        )
      }
    | PConstInt64(n) =>
      switch (Literals.conv_int64(n)) {
      | Some(n) => Ok(Const_int64(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Int64 literal %sL exceeds the range of representable 64-bit signed integers.",
            n,
          ),
        )
      }
    | PConstUint32(is_neg, n) =>
      switch (is_neg, Literals.conv_uint32(n)) {
      | (false, Some(num)) => Ok(Const_uint32(num))
      | (false, None) =>
        Error(
          Location.errorf(
            ~loc,
            "Uint32 literal %sul exceeds the range of representable 32-bit unsigned integers.",
            n,
          ),
        )
      | (true, Some(num)) =>
        Error(
          Location.errorf(
            ~loc,
            "Uint32 literal -%sul contains a sign but should be unsigned; consider using 0x%sul instead.",
            n,
            Literals.get_neg_uint32_hex(num),
          ),
        )
      | (true, None) =>
        Error(
          Location.errorf(
            ~loc,
            "Uint32 literal -%sul contains a sign but should be unsigned.",
            n,
          ),
        )
      }
    | PConstUint64(is_neg, n) =>
      switch (is_neg, Literals.conv_uint64(n)) {
      | (false, Some(num)) => Ok(Const_uint64(num))
      | (false, None) =>
        Error(
          Location.errorf(
            ~loc,
            "Uint64 literal %suL exceeds the range of representable 64-bit unsigned integers.",
            n,
          ),
        )
      | (true, Some(num)) =>
        Error(
          Location.errorf(
            ~loc,
            "Uint64 literal -%suL contains a sign but should be unsigned; consider using 0x%suL instead.",
            n,
            Literals.get_neg_uint64_hex(num),
          ),
        )
      | (true, None) =>
        Error(
          Location.errorf(
            ~loc,
            "Uint64 literal -%suL contains a sign but should be unsigned.",
            n,
          ),
        )
      }
    | PConstFloat32(n) =>
      switch (Literals.conv_float32(n)) {
      | Some(n) => Ok(Const_float32(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Float32 literal %sf exceeds the range of representable 32-bit floats.",
            n,
          ),
        )
      }
    | PConstFloat64(n) =>
      switch (Literals.conv_float64(n)) {
      | Some(n) => Ok(Const_float64(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Float64 literal %sd exceeds the range of representable 64-bit floats.",
            n,
          ),
        )
      }
    | PConstBigInt(n) =>
      switch (Literals.conv_bigint(n)) {
      | Some((bigint_negative, bigint_limbs)) =>
        Ok(Const_bigint({bigint_negative, bigint_limbs, bigint_rep: n}))
      // Should not happen, since `None` is only returned for the empty string,
      // and that is disallowed by the lexer
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Unable to parse big-integer literal %st.",
            n,
          ),
        )
      }
    | PConstRational(n, d) =>
      // TODO(#1168): allow arbitrary-length arguments in rational constants
      switch (Literals.conv_number_rational(n, d)) {
      | Some((n, d)) =>
        // (until above TODO is done, we keep existing behavior and limit to 32-bits (see #1168))
        Ok(
          Const_rational({
            rational_negative: Int32.compare(n, 0l) < 0, // true if rational is less than 0
            rational_num_limbs: [|Int64.abs(Int64.of_int32(n))|],
            rational_den_limbs: [|Int64.abs(Int64.of_int32(d))|],
            rational_num_rep: Int32.to_string(n),
            rational_den_rep: Int32.to_string(Int32.abs(d)),
          }),
        )
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "Rational literal %s/%sr is outside of the rational number range of the Number type.",
            n,
            d,
          ),
        )
      }
    | PConstWasmI32(n) =>
      switch (Literals.conv_wasmi32(n)) {
      | Some(n) => Ok(Const_wasmi32(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "WasmI32 literal %sn exceeds the range of representable 32-bit integers.",
            n,
          ),
        )
      }
    | PConstWasmI64(n) =>
      switch (Literals.conv_wasmi64(n)) {
      | Some(n) => Ok(Const_wasmi64(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "WasmI64 literal %sN exceeds the range of representable 64-bit integers.",
            n,
          ),
        )
      }
    | PConstWasmF32(n) =>
      switch (Literals.conv_wasmf32(n)) {
      | Some(n) => Ok(Const_wasmf32(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "WasmF32 literal %sw exceeds the range of representable 32-bit floats.",
            n,
          ),
        )
      }
    | PConstWasmF64(n) =>
      switch (Literals.conv_wasmf64(n)) {
      | Some(n) => Ok(Const_wasmf64(n))
      | None =>
        Error(
          Location.errorf(
            ~loc,
            "WasmF64 literal %sW exceeds the range of representable 64-bit floats.",
            n,
          ),
        )
      }
    | PConstBool(b) => Ok(Const_bool(b))
    | PConstVoid => Ok(Const_void)
    | PConstBytes(s) => Ok(Const_bytes(Bytes.of_string(s)))
    | PConstString(s) => Ok(Const_string(s))
    | PConstChar(c) => Ok(Const_char(c))
    };

let constant_or_raise = (env, loc, cst) =>
  switch (constant(loc, cst)) {
  | Ok(c) => c
  | Error(err) => raise(Error(err))
  };

let () =
  Location.register_error_of_exn(
    fun
    | Error(err) => Some(err)
    | _ => None,
  );
