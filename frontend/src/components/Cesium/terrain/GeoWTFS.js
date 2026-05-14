/* eslint-disable @typescript-eslint/no-this-alias, no-control-regex */
import { loadProto } from './util';

const proto = loadProto(`
option optimize_for = LITE_RUNTIME;
package GEOPOI;
enum enumGeometryType { ePoint = 0; eMultiLineString = 1; ePolygon = 2; }
message PBPOI {
  required uint64 OID = 1;
  required string Name = 2;
  repeated double Coordinates = 3 [packed=true];
  required enumGeometryType GeometryType = 4;
  optional int32 Interate = 5;
  optional int32 SymbolID = 10 [default = 0];
  optional double DisplayHeight = 11 [default = 32];
  optional uint32 ShiningColor = 12 [default = 0];
  optional uint32 FontNameIndex = 13 [default = 0];
  optional int32 FontSize = 14 [default = 18];
  optional uint32 FontColor = 15 [default = 0];
}
message StringTable { repeated string s = 1; }
message PBPOITile {
  required int64 Version = 1;
  required int64 TileKey = 2;
  required StringTable StringTable = 3;
  repeated PBPOI POIS = 4;
};
`).root.lookup('GEOPOI.PBPOITile');

const proto1 = loadProto(`
option optimize_for = LITE_RUNTIME;
package GEOPOI;
enum enumGeometryType { ePoint = 0; eMultiLineString = 1; ePolygon = 2; }
enum enumZCoordType { eCloseGround = 0; eCloseSeaSurface = 1; eRelativelyGround = 2; eAbsolute = 3; }
message PBPOI {
  required uint64 OID = 1;
  required string Name = 2;
  repeated double Coordinates = 3 [packed=true];
  required enumGeometryType GeometryType = 4;
  optional int32 Interate = 5;
  optional int32 SymbolID = 10 [default = 0];
  optional double DisplayHeight = 11 [default = 32];
  optional uint32 ShiningColor = 12 [default = 0];
  optional uint32 FontNameIndex = 13 [default = 0];
  optional int32 FontSize = 14 [default = 18];
  optional uint32 FontColor = 15 [default = 0];
  optional enumZCoordType ZCoordType = 16 [default = eAbsolute];
}
message StringTable { repeated string s = 1; }
message PBPOITile {
  required int64 Version = 1;
  required int64 TileKey = 2;
  required StringTable StringTable = 3;
  repeated PBPOI POIS = 4;
};
`).root.lookup('GEOPOI.PBPOITile');

const proto2 = loadProto(`
option optimize_for = LITE_RUNTIME;
package GEOPOI;
enum enumGeometryType { ePoint = 0; eMultiLineString = 1; ePolygon = 2; }
enum enumZCoordType { eCloseGround = 0; eCloseSeaSurface = 1; eRelativelyGround = 2; eAbsolute = 3; }
message PBPOI {
  required uint64 OID = 1;
  required string Name = 2;
  repeated double Coordinates = 3 [packed=true];
  required enumGeometryType GeometryType = 4;
  optional int32 Priority = 5;
  repeated int32 Interates = 6 [packed=true];
  optional int32 SymbolID = 10 [default = 0];
  optional double DisplayHeight = 11 [default = 32];
  optional uint32 ShiningColor = 12 [default = 0];
  optional uint32 FontNameIndex = 13 [default = 0];
  optional int32 FontSize = 14 [default = 18];
  optional uint32 FontColor = 15 [default = 0];
  optional enumZCoordType ZCoordType = 16 [default = eAbsolute];
  optional int32 FontStyle = 17;
  optional int32 ShiningSize = 18;
}
message StringTable { repeated string s = 1; }
message PBPOITile {
  required int64 Version = 1;
  required int64 TileKey = 2;
  required StringTable StringTable = 3;
  repeated PBPOI POIS = 4;
};
`).root.lookup('GEOPOI.PBPOITile');

function boundsIntersect(bound, test) {
    return (
        (test.minX >= bound.minX &&
            test.minX <= bound.maxX &&
            test.minY >= bound.minY &&
            test.minY <= bound.maxY) ||
        (test.maxX >= bound.minX &&
            test.maxX <= bound.maxX &&
            test.maxY >= bound.minY &&
            test.maxY <= bound.maxY) ||
        (test.minX >= bound.minX &&
            test.minX <= bound.maxX &&
            test.maxY >= bound.minY &&
            test.maxY <= bound.maxY) ||
        (test.maxX >= bound.minX &&
            test.maxX <= bound.maxX &&
            test.minY >= bound.minY &&
            test.minY <= bound.maxY)
    );
}

function getTextLength(text) {
    let length = 0;
    for (let i = 0; i < text.length; i++) {
        if (text.charAt(i).match(/[^\x00-\xff]/gi) != null) {
            length += 2;
        } else {
            length += 1;
        }
    }
    return length;
}

function rectIntersects(a, b) {
    const ax = a.x;
    const ay = a.y;
    const aw = a.width;
    const ah = a.height;
    const bx = b.x;
    const by = b.y;
    const bw = b.width;
    const bh = b.height;
    return !(
        (bx <= ax && bx + bw <= ax) ||
        (ax <= bx && ax + aw <= bx) ||
        (by <= ay && by + bh <= ay) ||
        (ay <= by && ay + ah <= by)
    );
}

function parseData(data) {
    const result = {
        stringTable: [],
        pois: [],
        enumGeometryType: [{ ePoint: 0 }, { eMultiLineString: 1 }, { ePolygon: 2 }],
        enumZCoordType: [
            { eCloseGround: 0 },
            { eCloseSeaSurface: 1 },
            { eRelativelyGround: 2 },
            { eAbsolute: 3 },
        ],
    };

    let message;
    const bytes = new Uint8Array(data);
    try {
        message = proto2.decode(bytes);
    } catch (error) {
        console.error(error.message);
    }

    if (!message) {
        try {
            message = proto1.decode(bytes);
        } catch (error) {
            console.error(error.message);
            message = proto.decode(bytes);
        }
    }

    result.version = parseInt(message.Version.toString(), 10);
    result.titleKey = parseInt(message.TileKey.toString(), 10);

    for (let i = 0; i < message.StringTable.s.length; i++) {
        result.stringTable.push(message.StringTable.s[i].toString());
    }

    let len = message.POIS.length;
    while (len--) {
        const poi = message.POIS[len];
        const item = {
            oid: `${parseInt(poi.OID.toString(), 10)}_${result.titleKey}`,
            name: poi.Name.toString(),
            symbolID: parseInt(poi.SymbolID.toString(), 10),
            displayHeight: poi.DisplayHeight,
            shiningColor: poi.ShiningColor,
            fontNameIndex: poi.FontNameIndex,
            fontSize: poi.FontSize,
            fontColor: poi.FontColor,
            zCoordType: poi.ZCoordType ?? undefined,
            geometryType: poi.GeometryType,
            coordinate: poi.Coordinates,
            priority: typeof poi.Priority === 'undefined' ? null : poi.Priority,
            interates: typeof poi.Interates === 'undefined' ? null : poi.Interates,
            fontStyle: typeof poi.FontStyle === 'undefined' ? null : poi.FontStyle,
            shiningSize: typeof poi.ShiningSize === 'undefined' ? null : poi.ShiningSize,
        };
        result.pois.push(item);
    }

    return result;
}

export default function createGeoWTFS(Cesium) {
    if (!Cesium) {
        throw new Error('Cesium is required to create GeoWTFS.');
    }

    const {
        Cartesian2,
        Cartesian3,
        Color,
        createGuid,
        defined,
        DeveloperError,
        Entity,
        HorizontalOrigin,
        LabelStyle,
        Math: CMath,
        SceneTransforms,
        VerticalOrigin,
        combine,
    } = Cesium;

    const defaultLabelGraphics = {
        font: '28px sans-serif',
        fontSize: 28,
        fillColor: Color.WHITE,
        scale: 0.5,
        outlineColor: Color.BLACK,
        outlineWidth: 5,
        style: LabelStyle.FILL_AND_OUTLINE,
        showBackground: false,
        backgroundColor: Color.RED,
        backgroundPadding: new Cartesian2(10, 10),
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.TOP,
        eyeOffset: Cartesian3.ZERO,
        pixelOffset: new Cartesian2(0, 8),
    };

    const defaultBillboardGraphics = {
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        eyeOffset: Cartesian3.ZERO,
        pixelOffset: Cartesian2.ZERO,
        alignedAxis: Cartesian3.ZERO,
        color: Color.WHITE,
        rotation: 0,
        scale: 1,
        width: 18,
        height: 18,
    };

    class GeoWTFS {
        constructor(viewer, options = {}) {
            if (!defined(viewer)) {
                throw new DeveloperError('viewer is required.');
            }
            if (!defined(options.url)) {
                throw new DeveloperError('options.url is required.');
            }

            this.viewer = viewer;
            this.proxy = options.proxy;
            this.url = options.url;
            this.icoUrl = options.icoUrl ?? options.iconUrl;
            this.metadata = options.metadata;
            this.roadMetadata = options.roadMetadata;
            this.roadUrl = options.roadUrl;
            this.labelGraphics = combine(options.labelGraphics, defaultLabelGraphics, true);
            this.billboardGraphics = combine(
                options.billboardGraphics,
                defaultBillboardGraphics,
                true,
            );
            this.aotuCollide = !!options.aotuCollide;
            this.collisionPadding = options.collisionPadding ?? [3, 5, 3, 5];
            this.serverFirstStyle = !!options.serverFirstStyle;
            this.subdomains = options.subdomains || [];
            this.tileCache = [];
            this.labelCache = [];
            this._isInitial = false;
            this._latelyGrid = [];
            this._latelyRefreshStamp = 0;
            this._latelyCollisionStamp = 0;
            const guid = createGuid();
            this._UUID = `GEO_WTFS_LABEL_${guid}`;
            this._UUIDRoad = `GEO_WTFS_LABEL_ROAD_${guid}`;
            this.viewer.camera.percentageChanged = 0.18;
            this.bindEvent();
        }

        bindEvent() {
            this.viewer.scene.camera.moveEnd.addEventListener(this._moveEnd, this);
            this.viewer.scene.camera.changed.addEventListener(this._changed, this);
        }

        _moveEnd() {
            clearTimeout(this._timer);
            const surface = this.viewer.scene.globe._surface;
            if (surface._tilesToRender.length < 2 || surface._tileLoadQueueHigh.length > 0) {
                this._timer = setTimeout(() => {
                    this._moveEnd();
                }, 100);
            } else {
                const tiles = this.getTilesToRender();
                if (this.compareArray(tiles, this._latelyGrid)) {
                    return;
                }
                this._queueCall(tiles);
                this.delaySynchronous();
            }
        }

        _changed() {
            const now = new Date().getTime();
            const sinceRefresh = now - this._latelyRefreshStamp;
            const sinceCollision = now - this._latelyCollisionStamp;
            if (sinceRefresh > 300) {
                this._moveEnd();
            }
            if (sinceCollision > 150) {
                this.collisionDetection();
            }
        }

        getTilesToRender() {
            const tiles = this.viewer.scene.globe._surface._tilesToRender
                .map((tile) => {
                    return {
                        x: tile.x,
                        y: tile.y,
                        level: tile.level,
                        boundBox: {
                            minX: CMath.toDegrees(tile.rectangle.west),
                            minY: CMath.toDegrees(tile.rectangle.south),
                            maxX: CMath.toDegrees(tile.rectangle.east),
                            maxY: CMath.toDegrees(tile.rectangle.north),
                        },
                    };
                })
                .sort((a, b) => b.level - a.level);

            const levels = [tiles[0].level];
            for (let i = 0; i < tiles.length; i++) {
                if (tiles[i].level !== levels[levels.length - 1]) {
                    levels.push(tiles[i].level);
                    if (levels.length > 4) {
                        tiles.splice(i, Infinity);
                        i--;
                    }
                }
            }
            return tiles;
        }

        compareArray(tiles, latelyGrid) {
            let diff = false;
            for (let t = 0; t < tiles.length; t++) {
                let exists = false;
                for (let i = 0; i < latelyGrid.length; i++) {
                    if (
                        tiles[t].x === latelyGrid[i].x &&
                        tiles[t].y === latelyGrid[i].y &&
                        tiles[t].level === latelyGrid[i].level
                    ) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    diff = true;
                    break;
                }
            }
            return !diff;
        }

        _queueCall(tiles) {
            this._latelyGrid = tiles;
            this._latelyRefreshStamp = new Date().getTime();
            let len = tiles.length;
            while (len--) {
                const tile = tiles[len];
                if (this.metadata && boundsIntersect(this.metadata.boundBox, tile.boundBox)) {
                    if (
                        this.metadata.minLevel > tile.level + 1 ||
                        this.metadata.maxLevel < tile.level + 1
                    ) {
                        return;
                    }
                    const cacheTile = this.getCacheTile(tile.x, tile.y, tile.level, 0);
                    if (cacheTile) {
                        this.addLabelAndIco(cacheTile);
                    } else {
                        const subdomain = this.subdomains.length
                            ? (tile.x + tile.y) % this.subdomains.length
                            : '';
                        const url = this.getTileUrl()
                            .replace('{x}', tile.x)
                            .replace('{y}', tile.y)
                            .replace('{z}', tile.level + 1)
                            .replace('{s}', subdomain);
                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', url, true);
                        xhr.responseType = 'arraybuffer';
                        const that = this;
                        xhr.onload = function () {
                            if (!(xhr.status < 200 || xhr.status >= 300)) {
                                const res = that.cutString(xhr.response);
                                let tileData;
                                if (res) {
                                    tileData = parseData(res);
                                    tileData.x = this.tile.x;
                                    tileData.y = this.tile.y;
                                    tileData.z = this.tile.z;
                                    tileData.t = 0;
                                    that.addCacheTile(tileData);
                                    that.addLabelAndIco(tileData);
                                } else {
                                    tileData = {
                                        x: this.tile.x,
                                        y: this.tile.y,
                                        z: this.tile.z,
                                        t: 0,
                                    };
                                    that.addCacheTile(tileData);
                                    that.delaySynchronous();
                                }
                            }
                        };
                        xhr.onerror = function (error) {
                            console.error(error);
                        };
                        xhr.send();
                        xhr.tile = {
                            x: tile.x,
                            y: tile.y,
                            z: tile.level + 1,
                        };
                    }
                }

                if (this.roadMetadata && boundsIntersect(this.roadMetadata.boundBox, tile.boundBox)) {
                    if (
                        this.roadMetadata.minLevel > tile.level + 1 ||
                        this.roadMetadata.maxLevel < tile.level + 1
                    ) {
                        return;
                    }
                    const cacheTile = this.getCacheTile(tile.x, tile.y, tile.level, 0);
                    if (cacheTile) {
                        this.addLabelAndIco(cacheTile);
                    } else {
                        const subdomain = this.subdomains.length
                            ? (tile.x + tile.y) % this.subdomains.length
                            : '';
                        const url = this.getRoadTileUrl()
                            .replace('{x}', tile.x)
                            .replace('{y}', tile.y)
                            .replace('{z}', tile.level + 1)
                            .replace('{s}', subdomain);
                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', url, true);
                        xhr.responseType = 'json';
                        const that = this;
                        xhr.onload = function () {
                            if (!(xhr.status < 200 || xhr.status >= 300)) {
                                const res = xhr.response;
                                let tileData;
                                if (res) {
                                    tileData = {
                                        pois: res.map((item) => {
                                            return {
                                                oid: `${item.LabelPoint.X}_${item.LabelPoint.Y}`,
                                                name: item.Feature.properties.Name,
                                                coordinate: [
                                                    item.LabelPoint.X,
                                                    item.LabelPoint.Y,
                                                    item.LabelPoint.Z ? item.LabelPoint.Z : 0,
                                                ],
                                            };
                                        }),
                                        x: this.tile.x,
                                        y: this.tile.y,
                                        z: this.tile.z,
                                        t: 1,
                                    };
                                    that.addCacheTile(tileData);
                                    that.addLabelAndIco(tileData);
                                } else {
                                    tileData = {
                                        x: this.tile.x,
                                        y: this.tile.y,
                                        z: this.tile.z,
                                        t: 1,
                                    };
                                    that.addCacheTile(tileData);
                                    that.delaySynchronous();
                                }
                            }
                        };
                        xhr.onerror = function (error) {
                            console.error(error);
                        };
                        xhr.send();
                        xhr.tile = {
                            x: tile.x,
                            y: tile.y,
                            z: tile.level + 1,
                        };
                    }
                }
            }
        }

        cutString(data) {
            if (!data) {
                return '';
            }
            const length = data.byteLength;
            if (length <= 28) {
                return '';
            }
            return data.slice(19, length - 9);
        }

        addCacheTile(tile) {
            if (this.tileCache.length > 999) {
                this.tileCache.splice(0, 500);
            }
            this.removeCacheTile(tile.x, tile.y, tile.z, tile.t);
            this.tileCache.push(tile);
        }

        getCacheTile(x, y, z, t) {
            let len = this.tileCache.length;
            while (len--) {
                const tileCache = this.tileCache[len];
                if (
                    tileCache.x === x &&
                    tileCache.y === y &&
                    tileCache.z === z &&
                    tileCache.t === t
                ) {
                    return tileCache;
                }
            }
            return null;
        }

        removeCacheTile(x, y, z, t) {
            let i = this.tileCache.length;
            while (i--) {
                const cacheTile = this.tileCache[i];
                if (cacheTile.x === x && cacheTile.y === y && cacheTile.z === z && cacheTile.t === t) {
                    this.tileCache.splice(i, 1);
                    return;
                }
            }
        }

        getCacheLabel(id) {
            let i = this.labelCache.length;
            while (i--) {
                const cacheLabel = this.labelCache[i];
                if (cacheLabel.name === this._UUID && cacheLabel.oid === id) {
                    return cacheLabel;
                }
            }
            return null;
        }

        addCacheLabel(label) {
            if (this.labelCache.length > 999) {
                this.labelCache.splice(0, 250);
            }
            this.removeCacheLabel(label.oid);
            label.timestamp = new Date().getTime();
            this.labelCache.push(label);
        }

        removeCacheLabel(id) {
            let i = this.labelCache.length;
            while (i--) {
                if (this.labelCache[i].name === this._UUID && this.labelCache[i].oid === id) {
                    this.labelCache.splice(i, 1);
                    return;
                }
            }
        }

        HexadecimalConversion(value) {
            if (value === 4278190080) {
                return '#000000';
            }
            let num = 4278190080 | parseInt(-Number(value), 10);
            let result = '';
            num = num.toString(16).substring(1);
            if (num.length < 6) {
                for (let i = 0; i < 6 - num.length; i++) {
                    result += '0';
                }
            }
            return `#${result}${num}`;
        }

        addLabelAndIco(tile) {
            if (tile.pois && tile.pois.length) {
                let i = tile.pois.length;
                while (i--) {
                    const item = tile.pois[i];
                    let label = this.getCacheLabel(item.oid);
                    if (!label) {
                        label = this.createLabel(item, tile);
                    }
                    if (label) {
                        this.addCacheLabel(label);
                    }
                }
            }
            this.delaySynchronous();
        }

        createLabel(poi, tile) {
            if (!poi) {
                return undefined;
            }

            const entityOption = {
                show: true,
                position: Cartesian3.fromDegrees(...poi.coordinate),
                label: { text: poi.name },
            };
            Object.assign(entityOption.label, this.labelGraphics);

            if (this.serverFirstStyle) {
                if (poi.fontSize !== undefined) {
                    entityOption.label.font = `${poi.fontSize}px `;
                    if (
                        poi.fontNameIndex !== undefined &&
                        tile.stringTable &&
                        tile.stringTable[poi.fontNameIndex]
                    ) {
                        entityOption.label.font += tile.stringTable[poi.fontNameIndex];
                    } else {
                        entityOption.label.font += 'sans-serif';
                    }
                    if (!this.labelGraphics.bold && (poi.fontStyle !== 1 || poi.fontStyle !== 3)) {
                        entityOption.label.font = `bold ${entityOption.label.font}`;
                    }
                    if (poi.fontStyle !== 2 || poi.fontStyle !== 3) {
                        entityOption.label.font = `italic ${entityOption.label.font}`;
                    }
                }
                if (poi.fontColor !== undefined) {
                    entityOption.label.fillColor = Color.fromCssColorString(
                        this.HexadecimalConversion(poi.fontColor),
                    );
                }
                if (poi.shiningColor !== undefined) {
                    entityOption.label.outlineColor = Color.fromCssColorString(
                        this.HexadecimalConversion(poi.shiningColor),
                    );
                }
                if (typeof poi.shiningSize === 'number') {
                    entityOption.label.outlineWidth = poi.shiningSize;
                }
                if (poi.showBackground !== undefined) {
                    entityOption.label.showBackground = poi.showBackground;
                }
                if (poi.backgroundColor !== undefined) {
                    entityOption.label.backgroundColor = poi.backgroundColor;
                }
                if (poi.backgroundPadding !== undefined) {
                    entityOption.label.backgroundPadding = poi.backgroundPadding;
                }
                if (poi.eyeOffset !== undefined) {
                    entityOption.label.eyeOffset = poi.eyeOffset;
                }
                if (poi.pixelOffset !== undefined) {
                    entityOption.label.pixelOffset = poi.pixelOffset;
                }
                if (poi.style !== undefined) {
                    entityOption.label.style = poi.style;
                }
                if (poi.scale !== undefined) {
                    entityOption.label.scale = poi.scale;
                }
                if (!tile.t) {
                    if (poi.verticalOrigin !== undefined) {
                        entityOption.label.verticalOrigin = poi.verticalOrigin;
                    }
                    if (poi.horizontalOrigin !== undefined) {
                        entityOption.label.horizontalOrigin = poi.horizontalOrigin;
                    }
                }
            }

            if (poi.symbolID !== undefined && poi.symbolID > -1 && this.icoUrl) {
                const subdomain = this.subdomains.length
                    ? (tile.x + tile.y) % this.subdomains.length
                    : '';
                entityOption.billboard = {
                    image: this.getIcoUrl()
                        .replace('{id}', poi.symbolID)
                        .replace('{s}', this.subdomains[subdomain]),
                };
                Object.assign(entityOption.billboard, this.billboardGraphics);
                if (this.serverFirstStyle) {
                    if (poi.displayHeight !== undefined) {
                        entityOption.billboard.width = poi.displayHeight;
                        entityOption.billboard.height = poi.displayHeight;
                    }
                    if (poi.eyeOffset !== undefined) {
                        entityOption.billboard.eyeOffset = poi.eyeOffset;
                    }
                    if (poi.pixelOffset !== undefined) {
                        entityOption.billboard.pixelOffset = poi.pixelOffset;
                    }
                    if (poi.rotation !== undefined) {
                        entityOption.billboard.rotation = poi.rotation;
                    }
                    if (poi.alignedAxis !== undefined) {
                        entityOption.billboard.alignedAxis = poi.alignedAxis;
                    }
                    if (poi.color !== undefined) {
                        entityOption.billboard.color = poi.color;
                    }
                    if (poi.scale !== undefined) {
                        entityOption.billboard.scale = poi.scale;
                    }
                    if (!tile.t) {
                        if (poi.verticalOrigin !== undefined) {
                            entityOption.billboard.verticalOrigin = poi.verticalOrigin;
                        }
                        if (poi.horizontalOrigin !== undefined) {
                            entityOption.billboard.horizontalOrigin = poi.horizontalOrigin;
                        }
                    }
                }
            }

            if (tile.t) {
                entityOption.label.verticalOrigin = VerticalOrigin.CENTER;
                entityOption.label.horizontalOrigin = HorizontalOrigin.CENTER;
                if (entityOption.billboard) {
                    entityOption.billboard.verticalOrigin = VerticalOrigin.CENTER;
                    entityOption.billboard.horizontalOrigin = HorizontalOrigin.CENTER;
                }
            }

            const entity = new Entity(entityOption);
            entity.name = tile.t ? this._UUIDRoad : this._UUID;
            entity.oid = poi.oid;
            entity.priority = poi.priority || 0;
            entity.xyz = `${tile.x}_${tile.y}_${tile.z - 1}`;
            return entity;
        }

        getIcoUrl() {
            return `${this.proxy ? this.proxy.proxy : ''}${this.icoUrl}`;
        }

        getTileUrl() {
            return `${this.proxy ? this.proxy.proxy : ''}${this.url}`;
        }

        getRoadTileUrl() {
            return `${this.proxy ? this.proxy.proxy : ''}${this.roadUrl}`;
        }

        delaySynchronous() {
            clearTimeout(this._timer2);
            this._timer2 = setTimeout(() => {
                this.synchronousLabel();
            }, 100);
        }

        synchronousLabel() {
            let i = this.labelCache.length;
            while (i--) {
                const label = this.labelCache[i];
                if (
                    label.timestamp >= this._latelyRefreshStamp &&
                    !this.viewer.entities.contains(label)
                ) {
                    if (this._isInitial && this.aotuCollide) {
                        label.show = false;
                    }
                    this.viewer.entities.add(label);
                }
            }

            if (!this._isInitial) {
                let j = this.viewer.entities.values.length - 1;
                while (j >= 0) {
                    const entity = this.viewer.entities.values[j];
                    if (
                        entity &&
                        entity.name &&
                        (entity.name === this._UUID || entity.name === this._UUIDRoad) &&
                        entity.timestamp < this._latelyRefreshStamp
                    ) {
                        this.viewer.entities.remove(entity);
                    }
                    j--;
                }
                if (this.aotuCollide) {
                    this.collisionDetection();
                }
            }
        }

        collisionDetection() {
            const entities = this.viewer.entities.values;
            const grouped = [];
            const visible = [];
            let len = entities.length;

            while (len--) {
                const entity = entities[len];
                if (entity.name && (entity.name === this._UUID || entity.name === this._UUIDRoad)) {
                    const point = this.getScreenCoordinates(entity.position.getValue(0));
                    entity.show = true;
                    entity.collisionBox = this.getLabelReact({ point, entity });

                    let group = null;
                    let groupIndex = grouped.length;
                    while (!group && groupIndex--) {
                        if (grouped[groupIndex].xyz === entity.xyz) {
                            group = grouped[groupIndex];
                        }
                    }
                    if (!group) {
                        group = { xyz: entity.xyz, entities: [] };
                        grouped.push(group);
                    }
                    group.entities.push(entity);
                }
            }

            let gLen = grouped.length;
            while (gLen--) {
                const group = grouped[gLen];
                group.entities.sort((a, b) => a.priority - b.priority);
                for (let i = 0; i < group.entities.length; i++) {
                    const base = group.entities[i];
                    if (base.show) {
                        for (let j = i + 1; j < group.entities.length; j++) {
                            if (group.entities[j].show && rectIntersects(base.collisionBox, group.entities[j].collisionBox)) {
                                group.entities[j].show = false;
                            }
                        }
                        visible.push(base);
                    }
                }
            }

            let m = visible.length;
            while (m--) {
                if (visible[m].show) {
                    visible.sort((a, b) => a.priority - b.priority);
                    for (let i = m + 1; i < visible.length; i++) {
                        if (
                            visible[i].show &&
                            rectIntersects(visible[m].collisionBox, visible[i].collisionBox)
                        ) {
                            visible[i].show = false;
                        }
                    }
                }
            }
        }

        getScreenCoordinates(position) {
            const scene = this.viewer.scene;
            if (!scene || !position) {
                return null;
            }
            if (typeof SceneTransforms.worldToDrawingBufferCoordinates === 'function') {
                return SceneTransforms.worldToDrawingBufferCoordinates(scene, position);
            }
            if (typeof SceneTransforms.worldToWindowCoordinates === 'function') {
                return SceneTransforms.worldToWindowCoordinates(scene, position);
            }
            if (typeof SceneTransforms.wgs84ToWindowCoordinates === 'function') {
                return SceneTransforms.wgs84ToWindowCoordinates(scene, position);
            }
            return null;
        }

        getLabelReact(data) {
            const { point, entity } = data;
            let fontSize = parseInt(entity.label.font, 10);
            fontSize = fontSize > 0 ? fontSize : 15;
            const lines = entity.label.text.getValue(0).split('\n');
            let longest = 0;
            for (let i = 0; i < lines.length; i++) {
                const length = getTextLength(lines[i]) / 2;
                if (longest < length) {
                    longest = length;
                }
            }
            const billboardWidth = entity.billboard
                ? entity.billboard.width.getValue(0) * entity.billboard.scale.getValue(0)
                : 1;
            const billboardHeight = entity.billboard
                ? entity.billboard.height.getValue(0) * entity.billboard.scale.getValue(0)
                : 1;
            return {
                x: (point ? point.x : -999) - billboardWidth / 2 - this.collisionPadding[3],
                y: (point ? point.y : -999) - billboardHeight / 2 - this.collisionPadding[0],
                width:
                    fontSize * entity.label.scale.getValue(0) * longest +
                    entity.label.pixelOffset.getValue(0).x +
                    billboardWidth +
                    this.collisionPadding[1],
                height:
                    fontSize * entity.label.scale.getValue(0) * longest +
                    entity.label.pixelOffset.getValue(0).y +
                    billboardWidth +
                    this.collisionPadding[2],
            };
        }

        initTDT(tiles, onReady) {
            let tick = 0;
            this._isInitial = true;
            this._queueCall(tiles);
            const timer = setInterval(() => {
                if (tick > 3) {
                    this._isInitial = false;
                    clearInterval(timer);
                    if (typeof onReady === 'function') {
                        onReady();
                    }
                }
                if (tick % 2 === 0 && this.aotuCollide) {
                    this.collisionDetection();
                }
                tick++;
            }, 600);
            return this;
        }

        getPropertyValue(key, data, defaults, fallback) {
            if (data[key] !== undefined) {
                return data[key];
            }
            return defaults[key] !== undefined ? defaults[key] : fallback;
        }

        unbindEvent() {
            this.viewer.scene.camera.moveEnd.removeEventListener(this._moveEnd, this);
            this.viewer.scene.camera.changed.removeEventListener(this._changed, this);
        }

        activate() {
            this._latelyGrid = [];
            this._moveEnd();
        }

        destroy() {
            let i = this.viewer.entities.values.length;
            while (i--) {
                const entity = this.viewer.entities.values[i];
                if (
                    entity.name &&
                    (entity.name === this._UUID || entity.name === this._UUIDRoad)
                ) {
                    this.viewer.entities.remove(entity);
                    i--;
                }
            }
            this.viewer.camera.percentageChanged = 0.5;
            this.unbindEvent();
            this.handler = this.handler && this.handler.destroy();
            this.proxy = undefined;
            this.viewer = undefined;
            this.url = undefined;
            this.labelGraphics = undefined;
            this.billboardGraphics = undefined;
            this.aotuCollide = undefined;
            this.collisionPadding = undefined;
            this.tileCache = undefined;
            this.labelCache = undefined;
            this._latelyGrid = undefined;
            this._latelyRefreshStamp = undefined;
            this._roadTileset = undefined;
        }

        getLabelVisibility(label) {
            if (!label) {
                return false;
            }
            const rect = this.viewer.canvas.getBoundingClientRect();
            return !(
                label.x < -10 ||
                label.x > rect.right + 10 ||
                label.y < -10 ||
                label.y > rect.bottom + 10
            );
        }
    }

    return GeoWTFS;
}
