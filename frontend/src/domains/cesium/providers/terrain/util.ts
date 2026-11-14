import * as protobuf from 'protobufjs';

export function loadProto(schema: any) {
    return protobuf.parse(schema);
}
