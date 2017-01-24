/**
 * @module opcua.miscellaneous
 */

import _ from "underscore";
import assert from "better-assert";
import { _defaultTypeMap } from "lib/misc/factories_builtin_types";
import { registerType } from "lib/misc/factories_builtin_types";
import {
  encodeLocaleId,
  decodeLocaleId,
  validateLocaleId
} from "lib/misc/encode_decode";
import util from "util";
/**
 * register a Basic Type ,
 * A basic type is new entity type that resolved to  a SubType
 * @example:
 *
 *
 *   registerBasicType({name:"Duration"   ,subtype:"Double"});
 *
 * @method registerBasicType
 * @param schema
 * @param schema.name {String}
 * @param schema.subtype {String} mandatory, the basic type from which the new type derives.
 *
 * @param [schema.encode] {Function} optional,a specific encoder function to encode an instance of this type.
 * @param schema.encode.value  {*}
 * @param schema.encode.stream {Stream}
 *
 * @param [schema.decode] {Function} optional,a specific decoder function that returns  the decode value out of the stream.
 * @param [schema.decode.stream] {Stream}
 *
 * @param [schema.coerce] {Function} optional, a method to convert a value into the request type.
 * @param schema.coerce.value {*} the value to coerce.
 *
 * @param [schema.random] {Function} optional, a method to construct a random object of this type
 *
 * @param [schema.toJSONFunc]{Function} optional, a method to convert a value into the request type.
 */
function registerBasicType(schema) {
  const name = schema.name;

  const t = _defaultTypeMap[schema.subtype];

    /* istanbul ignore next */
  if (!t) {
    console.log(util.inspect(schema, { color: true }));
    throw new Error(` cannot find subtype ${schema.subtype}`);
  }
  assert(_.isFunction(t.decode));

  const encodeFunc = schema.encode || t.encode;
  assert(_.isFunction(encodeFunc));

  const decodeFunc = schema.decode || t.decode;
  assert(_.isFunction(decodeFunc));

  const defaultValue = (schema.defaultValue === undefined) ? t.defaultValue : schema.defaultValue;
    // assert(_.isFunction(defaultValue));

  const coerceFunc = schema.coerce || t.coerce;

  const toJSONFunc = schema.toJSON || t.toJSON;

  const random = schema.random || defaultValue;

  const new_schema = {
    name,
    encode: encodeFunc,
    decode: decodeFunc,
    defaultValue,
    coerce: coerceFunc,
    toJSON: toJSONFunc,
    subType: schema.subtype,
    random
  };
  registerType(new_schema);
}

// =============================================================================================
// Registering the Basic Type already defined int the OPC-UA Specification
// =============================================================================================

registerBasicType({ name: "Counter", subtype: "UInt32" });
// OPC Unified Architecture, part 3.0 $8.13 page 65
registerBasicType({ name: "Duration", subtype: "Double" });
registerBasicType({ name: "UAString", subtype: "String" });
registerBasicType({ name: "UtcTime", subtype: "DateTime" });
registerBasicType({ name: "Int8", subtype: "SByte" });
registerBasicType({ name: "UInt8", subtype: "Byte" });
// xx registerBasicType({name:"XmlElement" ,subtype:"String"  });
registerBasicType({ name: "Time", subtype: "String" });
// string in the form "en-US" or "de-DE" or "fr" etc...
registerBasicType({
  name: "LocaleId",
  subtype: "String",
  encode: encodeLocaleId,
  decode: decodeLocaleId,
  validate: validateLocaleId,
  defaultValue: null
});
registerBasicType({ name: "ContinuationPoint", subtype: "ByteString" });
registerBasicType({ name: "Image", subtype: "ByteString" });
registerBasicType({ name: "ImageBMP", subtype: "ByteString" });
registerBasicType({ name: "ImageJPG", subtype: "ByteString" });
registerBasicType({ name: "ImagePNG", subtype: "ByteString" });
registerBasicType({ name: "ImageGIF", subtype: "ByteString" });

export { registerBasicType };
