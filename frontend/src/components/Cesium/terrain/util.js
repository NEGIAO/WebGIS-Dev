import * as protobuf from 'protobufjs';

export function loadProto(schema) {
    return protobuf.parse(schema);
}
