/**
 * @module opcua.miscellaneous
 * @class EncodeDecode
 * @static
 */

import assert from "better-assert";
import Enum from "lib/misc/enum";

import _ from "underscore";
import { isValidGuid } from "lib/datamodel/guid";
import { emptyGuid } from "lib/datamodel/guid";


import { NodeIdType } from "lib/datamodel/nodeid";
import { makeNodeId } from "lib/datamodel/nodeid";
import { makeExpandedNodeId } from "lib/datamodel/expanded_nodeid";
import { ExpandedNodeId } from "lib/datamodel/expanded_nodeid";
import { set_flag } from "lib/misc/utils";
import { check_flag } from "lib/misc/utils";
import { createFastUninitializedBuffer } from "lib/misc/buffer_utils";
import date_time from "lib/misc/date_time";
import { BinaryStream } from "lib/misc/binaryStream";
import { decodeStatusCode } from "lib/datamodel/opcua_status_code";
import { encodeStatusCode } from "lib/datamodel/opcua_status_code";
import { toHex } from "lib/misc/utils";

/**
 * return a random integer value in the range of  min inclusive and  max exclusive
 * @method getRandomInt
 * @param min
 * @param max
 * @return {*}
 * @private
 */
function getRandomInt(min, max) {
    // note : Math.random() returns a random number between 0 (inclusive) and 1 (exclusive):
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * return a random float value in the range of  min inclusive and  max exclusive
 * @method getRandomInt
 * @param min
 * @param max
 * @return {*}
 * @private
 */
function getRandomDouble(min, max) {
  return Math.random() * (max - min) + min;
}

function isValidString(value) {
  return typeof value === "string";
}

function randomString() {
  const nbCar = getRandomInt(1, 20);
  const cars = [];
  for (let i = 0; i < nbCar; i++) {
    cars.push(String.fromCharCode(65 + getRandomInt(0, 26)));
  }
  return cars.join("");
}

function decodeString(stream) {
  return stream.readString();
}

function encodeString(value, stream) {
  stream.writeString(value);
}

function isValidUInt16(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return value >= 0 && value <= 0xFFFF;
}

function randomUInt16() {
  return getRandomInt(0, 0xFFFF);
}

function encodeUInt16(value, stream) {
  stream.writeUInt16(value);
}

function decodeUInt16(stream) {
  return stream.readUInt16();
}

function isValidInt16(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return value >= -0x8000 && value <= 0x7FFF;
}

function randomInt16() {
  return getRandomInt(-0x8000, 0x7FFF);
}

function encodeInt16(value, stream) {
  assert(_.isFinite(value));
  stream.writeInt16(value);
}

function decodeInt16(stream) {
  return stream.readInt16();
}

function isValidInt32(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return value >= -0x80000000 && value <= 0x7fffffff;
}

function randomInt32() {
  return getRandomInt(-0x80000000, 0x7fffffff);
}

function encodeInt32(value, stream) {
  assert(_.isFinite(value));
  stream.writeInteger(value);
}

function decodeInt32(stream) {
  return stream.readInteger();
}

function isValidUInt32(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return value >= 0 && value <= 0xFFFFFFFF;
}

function randomUInt32() {
  return getRandomInt(0, 0xFFFFFFFF);
}

function encodeUInt32(value, stream) {
  stream.writeUInt32(value);
}

function decodeUInt32(stream) {
  return stream.readUInt32();
}


const isValidBoolean = value => typeof value === "boolean";

function randomBoolean() {
  return Math.random() > 0.5;
}

function encodeBoolean(value, stream) {
  assert(isValidBoolean(value));
  stream.writeUInt8(value ? 1 : 0);
}

function decodeBoolean(stream) {
  return !!stream.readUInt8();
}

function isValidInt8(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return value >= -0x80 && value <= 0x7F;
}


function randomInt8() {
  return getRandomInt(-0x7F, 0x7E);
}

function encodeInt8(value, stream) {
  assert(isValidInt8(value));
  stream.writeInt8(value);
}

function decodeInt8(stream) {
  return stream.readInt8();
}

const isValidSByte = isValidInt8;
const randomSByte = randomInt8;
const encodeSByte = encodeInt8;
const decodeSByte = decodeInt8;

function isValidUInt8(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return value >= -0x00 && value <= 0xFF;
}

function randomUInt8() {
  return getRandomInt(0x00, 0xFF);
}

function encodeUInt8(value, stream) {
  stream.writeUInt8(value);
}

function decodeUInt8(stream) {
  return stream.readUInt8();
}

const isValidByte = isValidUInt8;
const randomByte = randomUInt8;
const encodeByte = encodeUInt8;
const decodeByte = decodeUInt8;

const minFloat = -3.40 * Math.pow(10, 38);
const maxFloat = 3.40 * Math.pow(10, 38);

function isValidFloat(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return value > minFloat && value < maxFloat;
}

function roundToFloat2(float) {
  if (float === 0) {
    return float;
  }
    // this method artificially rounds a float to 7 significant digit in base 10
    // Note:
    //   this is to overcome the that that Javascript doesn't  provide  single precision float values (32 bits)
    //   but only double precision float values

    // wikipedia:(http://en.wikipedia.org/wiki/Floating_point)
    //
    // * Single precision, usually used to represent the "float" type in the C language family
    //   (though this is not guaranteed). This is a binary format that occupies 32 bits (4 bytes) and its
    
    //   significand has a precision of 24 bits (about 7 decimal digits).
    // * Double precision, usually used to represent the "double" type in the C language family
    //   (though this is not guaranteed). This is a binary format that occupies 64 bits (8 bytes) and its
    //   significand has a precision of 53 bits (about 16 decimal digits).
    //
  const nbDigits = Math.ceil(Math.log(Math.abs(float)) / Math.log(10));
  const r = Math.pow(10,(-nbDigits + 2));
  return Math.round(float * r) / r;
}

const r = new Float32Array(1);
function roundToFloat(float) {
  r[0] = float;
  const float_r = r[0];
  return float_r;
}

function randomFloat() {
  return roundToFloat(getRandomDouble(-1000, 1000));
}

function encodeFloat(value, stream) {
  stream.writeFloat(value);
}

function decodeFloat(stream) {
  const float = stream.readFloat();
  return float;
    // xx return roundToFloat(float);
}

function isValidDouble(value) {
  if (!_.isFinite(value)) {
    return false;
  }
  return true;
}

function randomDouble() {
  return getRandomDouble(-1000000, 1000000);
}

function encodeDouble(value, stream) {
  stream.writeDouble(value);
}

function decodeDouble(stream) {
  return stream.readDouble();
}

const bn_dateToHundredNanoSecondFrom1601 = date_time.bn_dateToHundredNanoSecondFrom1601;
const bn_hundredNanoSecondFrom1601ToDate = date_time.bn_hundredNanoSecondFrom1601ToDate;

//  Date(year, month [, day, hours, minutes, seconds, ms])
function isValidDateTime(value) {
  return value instanceof Date;
}

function randomDateTime() {
  const r = getRandomInt;
  return new Date(
        1900 + r(0, 200), r(0, 11), r(0, 28),
        r(0, 24), r(0, 59), r(0, 59), r(0, 1000));
}

function encodeDateTime(date, stream) {
  if (!date) {
    stream.writeUInt32(0);
    stream.writeUInt32(0);
    return;
  }
  if (!(date instanceof Date)) {
    throw new Error(`Expecting a Date : but got a ${typeof (date)} ${date.toString()}`);
  }
  assert(date instanceof Date);
  const hl = bn_dateToHundredNanoSecondFrom1601(date);
  const hi = hl[0];
  const lo = hl[1];
  stream.writeUInt32(lo);
  stream.writeUInt32(hi);
    // xx assert(date.toString() === bn_hundredNanoSecondFrom1601ToDate(hi, lo).toString());
}

function decodeDateTime(stream) {
  const lo = stream.readUInt32();
  const hi = stream.readUInt32();
  return bn_hundredNanoSecondFrom1601ToDate(hi, lo);
}


function randomGuid() {
  const b = new BinaryStream(20);
  for (let i = 0; i < 20; i++) {
    b.writeUInt8(getRandomInt(0, 255));
  }
  b.rewind();
  const value = decodeGuid(b);
  return value;
}

function encodeGuid(guid, stream) {
  if (!isValidGuid(guid)) {
    throw new Error(` Invalid GUID ${JSON.stringify(guid)}`);
  }
    //           1         2         3
    // 012345678901234567890123456789012345
    // |        |    |    | |  | | | | | |
    // 12345678-1234-1234-ABCD-0123456789AB
    // 00000000-0000-0000-0000-000000000000";
  function write_UInt32(starts) {
    let start;
    let i;
    const n = starts.length;
    for (i = 0; i < n; i++) {
      start = starts[i];
      stream.writeUInt32(parseInt(guid.substr(start, 8), 16));
    }
  }

  function write_UInt16(starts) {
    let start;
    let i;
    const n = starts.length;
    for (i = 0; i < n; i++) {
      start = starts[i];
      stream.writeUInt16(parseInt(guid.substr(start, 4), 16));
    }
  }

  function write_UInt8(starts) {
    let start;
    let i;
    const n = starts.length;
    for (i = 0; i < n; i++) {
      start = starts[i];
      stream.writeUInt8(parseInt(guid.substr(start, 2), 16));
    }
  }

  write_UInt32([0]);
  write_UInt16([9, 14]);
  write_UInt8([19, 21, 24, 26, 28, 30, 32, 34]);
}


function decodeGuid(stream) {
  function read_UInt32() {
    return toHex(stream.readUInt32(), 8);
  }

  function read_UInt16() {
    return toHex(stream.readUInt16(), 4);
  }

  function read_UInt8() {
    return toHex(stream.readUInt8(), 2);
  }

  function read_many(func, nb) {
    let result = "";
    for (let i = 0; i < nb; i++) {
      result += func();
    }
    return result;
  }

  const data1 = read_UInt32();

  const data2 = read_UInt16();

  const data3 = read_UInt16();

  const data4_5 = read_many(read_UInt8, 2);

  const data6_B = read_many(read_UInt8, 6);

  const guid = `${data1}-${data2}-${data3}-${data4_5}-${data6_B}`;

  return guid.toUpperCase();
}


const EnumNodeIdEncoding = new Enum({
  TwoBytes: 0x00, // A numeric value that fits into the two byte representation.
  FourBytes: 0x01, // A numeric value that fits into the four byte representation.
  Numeric: 0x02, // A numeric value that does not fit into the two or four byte representations.
  String: 0x03, // A String value.
  Guid: 0x04, // A Guid value.
  ByteString: 0x05, // An opaque (ByteString) value.
  NamespaceUriFlag: 0x80, //  NamespaceUriFlag on  ExpandedNodeId is present
  ServerIndexFlag: 0x40  //  NamespaceUriFlag on  ExpandedNodeId is present
});


function is_uint8(value) {
  return value >= 0 && value <= 0xFF;
}
function is_uint16(value) {
  return value >= 0 && value <= 0xFFFF;
}

function nodeID_encodingByte(nodeId) {
  if (!nodeId) {
    return 0;
  }
  assert(nodeId.hasOwnProperty("identifierType"));

  let encodingByte = 0;

  if (nodeId.identifierType.is(NodeIdType.NUMERIC)) {
    if (is_uint8(nodeId.value) && (!nodeId.namespace) && !nodeId.namespaceUri && !nodeId.serverIndex) {
      encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.TwoBytes);
    } else if (is_uint16(nodeId.value) && is_uint8(nodeId.namespace) && !nodeId.namespaceUri && !nodeId.serverIndex) {
      encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.FourBytes);
    } else {
      encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.Numeric);
    }
  } else if (nodeId.identifierType.is(NodeIdType.STRING)) {
    encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.String);
  } else if (nodeId.identifierType.is(NodeIdType.BYTESTRING)) {
    encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.ByteString);
  } else if (nodeId.identifierType.is(NodeIdType.GUID)) {
    encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.Guid);
  }

  if (nodeId.hasOwnProperty("namespaceUri") && nodeId.namespaceUri) {
    encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.NamespaceUriFlag);
  }
  if (nodeId.hasOwnProperty("serverIndex") && nodeId.serverIndex) {
    encodingByte = set_flag(encodingByte, EnumNodeIdEncoding.ServerIndexFlag);
  }
  return encodingByte;
}


function isValidNodeId(nodeId) {
  if (nodeId === null || nodeId === void 0) {
    return false;
  }
  return nodeId.hasOwnProperty("identifierType")
        ;
}

function randomNodeId() {
  const value = getRandomInt(0, 0xFFFFF);
  const namespace = getRandomInt(0, 3);
  return makeNodeId(value, namespace);
}


function _encodeNodeId(encoding_byte, nodeId, stream) {
  stream.writeUInt8(encoding_byte);// encoding byte

    /* jslint bitwise: true */
  encoding_byte &= 0x3F;

  switch (encoding_byte) {
    case EnumNodeIdEncoding.TwoBytes.value:
      stream.writeUInt8(nodeId.value);
      break;
    case EnumNodeIdEncoding.FourBytes.value:
      stream.writeUInt8(nodeId.namespace);
      stream.writeUInt16(nodeId.value);
      break;
    case EnumNodeIdEncoding.Numeric.value:
      stream.writeUInt16(nodeId.namespace);
      stream.writeUInt32(nodeId.value);
      break;
    case EnumNodeIdEncoding.String.value:
      stream.writeUInt16(nodeId.namespace);
      encodeString(nodeId.value, stream);
      break;
    case EnumNodeIdEncoding.ByteString.value:
      stream.writeUInt16(nodeId.namespace);
      encodeByteString(nodeId.value, stream);
      break;
    default:
      assert(encoding_byte === EnumNodeIdEncoding.Guid.value);
      stream.writeUInt16(nodeId.namespace);
      encodeGuid(nodeId.value, stream);
      break;
  }
}

function encodeNodeId(nodeId, stream) {
  let encoding_byte = nodeID_encodingByte(nodeId);
    /* jslint bitwise: true */
  encoding_byte &= 0x3F;
  _encodeNodeId(encoding_byte, nodeId, stream);
}

function encodeExpandedNodeId(expandedNodeId, stream) {
  const encodingByte = nodeID_encodingByte(expandedNodeId);
  _encodeNodeId(encodingByte, expandedNodeId, stream);
  if (check_flag(encodingByte, EnumNodeIdEncoding.NamespaceUriFlag)) {
    encodeString(expandedNodeId.namespaceUri, stream);
  }
  if (check_flag(encodingByte, EnumNodeIdEncoding.ServerIndexFlag)) {
    encodeUInt32(expandedNodeId.serverIndex, stream);
  }
}

const _decodeNodeId = (encoding_byte, stream) => {
  let value;
  let namespace;
    /* jslint bitwise: true */
  encoding_byte &= 0x3F;
  switch (encoding_byte) {
    case EnumNodeIdEncoding.TwoBytes.value:
      value = stream.readUInt8();
      break;
    case EnumNodeIdEncoding.FourBytes.value:
      namespace = stream.readUInt8();
      value = stream.readUInt16();
      break;
    case EnumNodeIdEncoding.Numeric.value:
      namespace = stream.readUInt16();
      value = stream.readUInt32(stream);
      break;
    case EnumNodeIdEncoding.String.value:
      namespace = stream.readUInt16();
      value = decodeString(stream);
      break;
    case EnumNodeIdEncoding.ByteString.value:
      namespace = stream.readUInt16();
      value = decodeByteString(stream);
      break;
    default:
      if (encoding_byte !== EnumNodeIdEncoding.Guid.value) {
                /* jslint bitwise: true */
        console.log(` encoding_byte = ${encoding_byte.toString(16)}`, encoding_byte, encoding_byte & 0x3F);
                // xx var exit = require("exit");
                // xx exit(1);
        throw new Error(` encoding_byte = ${encoding_byte.toString(16)}`);
      }
      namespace = stream.readUInt16();
      value = decodeGuid(stream);
      assert(isValidGuid(value));
      break;
  }
  return makeNodeId(value, namespace);
};

function decodeNodeId(stream) {
  const encoding_byte = stream.readUInt8();
  return _decodeNodeId(encoding_byte, stream);
}

function decodeExpandedNodeId(stream) {
  const encoding_byte = stream.readUInt8();
  const expandedNodeId = _decodeNodeId(encoding_byte, stream);
  expandedNodeId.namespaceUri = null;
  expandedNodeId.serverIndex = 0;

  if (check_flag(encoding_byte, EnumNodeIdEncoding.NamespaceUriFlag)) {
    expandedNodeId.namespaceUri = decodeString(stream);
  }
  if (check_flag(encoding_byte, EnumNodeIdEncoding.ServerIndexFlag)) {
    expandedNodeId.serverIndex = decodeUInt32(stream);
  }
  const e = expandedNodeId;
  return new ExpandedNodeId(e.identifierType, e.value,e.namespace, e.namespaceUri, e.serverIndex);
}

const encodeLocaleId = encodeString;
const decodeLocaleId = decodeString;

function validateLocaleId() {
  return; // TODO : check that localeID is well-formed
  // see part 3 $8.4 page 63

  true;
}

function isValidByteString(value) {
  return value === null || value instanceof Buffer;
}

function randomByteString(value, len) {
  len = len || getRandomInt(1, 200);
  const b = createFastUninitializedBuffer(len);
  for (let i = 0; i < len; i++) {
    b.writeUInt8(getRandomInt(0, 255), i);
  }
  return b;
}

function encodeByteString(byteString, stream) {
  stream.writeByteStream(byteString);
}

function decodeByteString(stream) {
  return stream.readByteStream();
}

function isValidUInt64(value) {
  return value instanceof Array && value.length === 2;
}

function randomUInt64() {
  return [getRandomInt(0, 0xFFFFFFFF), getRandomInt(0, 0xFFFFFFFF)];
}

function encodeUInt64(value, stream) {
  if (_.isNumber(value)) {
    value = coerceUInt64(value);
  }
  // gilesbradshaw - put in if below..
  if (value == null) {
    value = {};
  }
  // if (value) {
  stream.writeUInt32(value[1]);
  stream.writeUInt32(value[0]);
  // }
}

function decodeUInt64(stream) {
  const low = stream.readUInt32();
  const high = stream.readUInt32();
  return constructInt64(high, low);
}

function constructInt64(high, low) {
  assert(low >= 0 && low <= 0xFFFFFFFF);
  assert(high >= 0 && high <= 0xFFFFFFFF);
  return [high, low];
}

function coerceUInt64(value) {
  let high;
  let low;
  let v;
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Array) {
    assert(_.isNumber(value[0]));
    assert(_.isNumber(value[1]));
    return value;
  }
  if (typeof value === "string") {
    v = value.split(",");
    high = parseInt(v[0], 10);
    low = parseInt(v[1], 10);
    return constructInt64(high, low);
  }
  if (value > 0xFFFFFFFF) {
        // beware : as per javascript, value is a double here !
        //          our conversion will suffer from some inacuracy

    high = Math.floor(value / 0x100000000);
    low = value - high * 0x100000000;
    return constructInt64(high, low);
  }
  return constructInt64(0, value);
}

function randomInt64() {
   // High, low
  return [getRandomInt(0, 0xFFFFFFFF), getRandomInt(0, 0xFFFFFFFF)];
}

const coerceInt64 = coerceUInt64;
const isValidInt64 = isValidUInt64;
const encodeInt64 = encodeUInt64;
const decodeInt64 = decodeUInt64;


const falsy = /^(?:f(?:alse)?|no?|0+)$/i;

function coerceBoolean(value) {
  if (value === null || value === undefined) {
    return value;
  }

    // http://stackoverflow.com/a/24744599/406458
  return !falsy.test(value) && !!value;

    // return !!(+value||String(value).toLowerCase().replace(!!0,''));
}

function coerceInt8(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceUInt8(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceByte(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceSByte(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceUInt16(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceInt16(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceUInt32(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceInt32(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseInt(value, 10);
}

function coerceFloat(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseFloat(value);
}

function coerceDouble(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return parseFloat(value);
}

/**
 * @method encodeArray
 * @param arr {Array} the array to encode.
 * @param stream {BinaryStream}  the stream.
 * @param encode_element_func  {Function}  The  function to encode a single array element.
 * @param encode_element_func.element {object}
 * @param encode_element_func.stream  {BinaryStream}  the stream.
 */
function encodeArray(arr, stream, encode_element_func) {
  if (arr === null) {
    stream.writeUInt32(0xFFFFFFFF);
    return;
  }
  assert(_.isArray(arr));
  stream.writeUInt32(arr.length);
  for (let i = 0; i < arr.length; i++) {
    encode_element_func(arr[i], stream);
  }
}

/**
 * @method decodeArray
 * @param stream {BinaryStream}  the stream.
 * @param decode_element_func {Function}  The  function to decode a single array element. This function returns the element decoded from the stream
 * @param decode_element_func.stream {BinaryStream}  the stream.
 * @return {Array}
 */
function decodeArray(stream, decode_element_func) {
  const length = stream.readUInt32(stream);
  if (length === 0xFFFFFFFF) {
    return null;
  }

  const arr = [];
  for (let i = 0; i < length; i++) {
    arr.push(decode_element_func(stream));
  }

  return arr;
}


export {
  makeExpandedNodeId,
  NodeIdType,
  makeNodeId,
  
  isValidString,
  randomString,
  decodeString,
  encodeString,

  coerceUInt16,
  isValidUInt16,
  randomUInt16,
  decodeUInt16,
  encodeUInt16,

  coerceInt16,
  isValidInt16,
  randomInt16,
  decodeInt16,
  encodeInt16,

  coerceInt32,
  isValidInt32,
  randomInt32,
  decodeInt32,
  encodeInt32,

  coerceUInt32,
  isValidUInt32,
  randomUInt32,
  decodeUInt32,
  encodeUInt32,

  coerceBoolean,
  isValidBoolean,
  randomBoolean,
  decodeBoolean,
  encodeBoolean,

  coerceInt8,
  isValidInt8,
  randomInt8,
  decodeInt8,
  encodeInt8,

  coerceSByte,
  isValidSByte,
  randomSByte,
  decodeSByte,
  encodeSByte,

  coerceUInt8,
  isValidUInt8,
  randomUInt8,
  decodeUInt8,
  encodeUInt8,

  coerceByte,
  isValidByte,
  randomByte,
  decodeByte,
  encodeByte,

  coerceFloat,
  isValidFloat,
  randomFloat,
  decodeFloat,
  encodeFloat,

  coerceDouble,
  isValidDouble,
  randomDouble,
  decodeDouble,
  encodeDouble,

  isValidDateTime,
  randomDateTime,
  decodeDateTime,
  encodeDateTime,

  isValidGuid,
  randomGuid,
  decodeGuid,
  encodeGuid,
  emptyGuid,

  isValidNodeId,
  randomNodeId,
  decodeNodeId,
  encodeNodeId,


  decodeExpandedNodeId,
  encodeExpandedNodeId,

  validateLocaleId,
  decodeLocaleId,
  encodeLocaleId,

  isValidByteString,
  randomByteString,
  decodeByteString,
  encodeByteString,


  decodeStatusCode,
  encodeStatusCode,

  isValidUInt64,
  randomUInt64,
  decodeUInt64,
  encodeUInt64,
  coerceUInt64,

  constructInt64,
  isValidInt64,
  randomInt64,
  decodeInt64,
  encodeInt64,
  coerceInt64,

  encodeArray,
  decodeArray
};

