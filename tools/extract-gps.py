#!/usr/bin/env python3
"""
从 GoPro MP4 视频中提取 GPS 数据，导出为 GeoJSON 和 GPX 文件。
导出的 GeoJSON 文件可直接拖入 KartPro 进行分析。

用法:
  python3 extract-gps.py <video.mp4> [--output-dir <dir>]

示例:
  python3 extract-gps.py GX010042.MP4
  python3 extract-gps.py GX010042.MP4 --output-dir ./gps-data
"""

import sys
import os
import json
import struct
import argparse
from datetime import datetime, timezone


def read_mp4_boxes(f, end_pos=None):
    """递归读取 MP4 box 结构"""
    boxes = []
    while True:
        pos = f.tell()
        if end_pos and pos >= end_pos:
            break

        header = f.read(8)
        if len(header) < 8:
            break

        size = struct.unpack('>I', header[:4])[0]
        box_type = header[4:8].decode('ascii', errors='replace')

        if size == 0:
            break
        if size == 1:
            ext_size = f.read(8)
            if len(ext_size) < 8:
                break
            size = struct.unpack('>Q', ext_size)[0]

        boxes.append({
            'type': box_type,
            'offset': pos,
            'size': size,
        })

        f.seek(pos + size)

    return boxes


def find_gpmf_track(filepath):
    """在 MP4 文件中找到 GPMF 元数据轨道"""
    with open(filepath, 'rb') as f:
        boxes = read_mp4_boxes(f)

        for box in boxes:
            if box['type'] == 'moov':
                f.seek(box['offset'] + 8)
                moov_boxes = read_mp4_boxes(f, box['offset'] + box['size'])

                for trak in moov_boxes:
                    if trak['type'] == 'trak':
                        f.seek(trak['offset'] + 8)
                        trak_data = f.read(trak['size'] - 8)
                        if b'GoPro MET' in trak_data or b'gpmd' in trak_data:
                            return True
    return False


def extract_with_gopro2gpx(filepath):
    """使用 gopro2gpx 库提取 GPS 数据"""
    from gopro2gpx.gpmf import extract as gpmf_extract
    from gopro2gpx.gopro2gpx import BuildGPSPoints

    data = gpmf_extract.extract_gpmf(filepath)
    if not data:
        raise ValueError("未在视频中找到 GPMF 元数据。确保这是带 GPS 的 GoPro 视频。")

    points = BuildGPSPoints(data)
    if not points:
        raise ValueError("GPMF 数据中没有 GPS 点。可能 GPS 未锁定或未启用。")

    return points


def extract_with_binary_parse(filepath):
    """直接解析 MP4 中的 GPMF 数据流（备用方案）"""
    gps_points = []

    with open(filepath, 'rb') as f:
        data = f.read()

    # 搜索 GPS5 FourCC 标记（GoPro GPS 数据格式）
    search_start = 0
    while True:
        idx = data.find(b'GPS5', search_start)
        if idx == -1:
            break

        try:
            # GPS5 后面是类型和大小信息
            type_byte = data[idx + 4]
            struct_size = data[idx + 5]
            repeat_msb = data[idx + 6]
            repeat_lsb = data[idx + 7]
            repeat = (repeat_msb << 8) | repeat_lsb

            if struct_size == 20 and repeat > 0 and repeat < 1000:
                offset = idx + 8
                for _ in range(repeat):
                    if offset + 20 > len(data):
                        break
                    values = struct.unpack('>iiiii', data[offset:offset + 20])
                    lat = values[0] / 1e7
                    lng = values[1] / 1e7
                    alt = values[2] / 1000.0
                    speed_2d = values[3] / 1000.0  # m/s
                    speed_3d = values[4] / 1000.0  # m/s

                    if -90 <= lat <= 90 and -180 <= lng <= 180 and lat != 0 and lng != 0:
                        gps_points.append({
                            'lat': lat,
                            'lng': lng,
                            'alt': alt,
                            'speed': speed_2d,
                            'speed_3d': speed_3d,
                        })

                    offset += 20
        except (IndexError, struct.error):
            pass

        search_start = idx + 8

    if not gps_points:
        raise ValueError("未找到有效的 GPS 数据。确保这是带 GPS 的 GoPro 视频。")

    return gps_points


def points_to_geojson(points, source_file):
    """将 GPS 点转换为 GeoJSON 格式（与 KartPro 兼容）"""
    coordinates = []
    timestamps = []

    base_time = int(datetime.now(timezone.utc).timestamp() * 1000)

    for i, p in enumerate(points):
        if hasattr(p, 'latitude'):
            # gopro2gpx GPSPoint 对象
            lat, lng = p.latitude, p.longitude
            alt = getattr(p, 'altitude', 0) or 0
            speed = getattr(p, 'speed', 0) or 0
            ts = getattr(p, 'time', None)
            if ts and hasattr(ts, 'timestamp'):
                time_ms = int(ts.timestamp() * 1000)
            else:
                time_ms = base_time + i * 125  # 8Hz fallback
        else:
            # dict 格式
            lat = p['lat']
            lng = p['lng']
            alt = p.get('alt', 0)
            speed = p.get('speed', 0)
            time_ms = base_time + i * 125  # 8Hz fallback

        coordinates.append([lng, lat, alt])
        timestamps.append(time_ms)

    geojson = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates,
        },
        "properties": {
            "source": os.path.basename(source_file),
            "extracted_at": datetime.now(timezone.utc).isoformat(),
            "point_count": len(coordinates),
            "AbsoluteUtcMicroSec": timestamps,
        }
    }

    return geojson


def points_to_gpx(points, source_file):
    """将 GPS 点转换为 GPX 格式"""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="KartPro GPS Extractor"',
        '  xmlns="http://www.topografix.com/GPX/1/1">',
        f'  <metadata><name>{os.path.basename(source_file)}</name></metadata>',
        '  <trk>',
        f'    <name>{os.path.basename(source_file)}</name>',
        '    <trkseg>',
    ]

    for i, p in enumerate(points):
        if hasattr(p, 'latitude'):
            lat, lng = p.latitude, p.longitude
            alt = getattr(p, 'altitude', 0) or 0
            ts = getattr(p, 'time', None)
            time_str = ts.isoformat() if ts and hasattr(ts, 'isoformat') else ''
        else:
            lat, lng = p['lat'], p['lng']
            alt = p.get('alt', 0)
            time_str = ''

        line = f'      <trkpt lat="{lat}" lon="{lng}">'
        if alt:
            line += f'<ele>{alt}</ele>'
        if time_str:
            line += f'<time>{time_str}</time>'
        line += '</trkpt>'
        lines.append(line)

    lines.extend([
        '    </trkseg>',
        '  </trk>',
        '</gpx>',
    ])

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='从 GoPro MP4 视频中提取 GPS 数据',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='导出的 .geojson 文件可直接拖入 KartPro 进行圈速分析。'
    )
    parser.add_argument('video', help='GoPro MP4 视频文件路径')
    parser.add_argument('--output-dir', '-o', default=None,
                        help='输出目录（默认与视频文件同目录）')
    parser.add_argument('--format', '-f', choices=['geojson', 'gpx', 'both'],
                        default='both', help='输出格式（默认: both）')

    args = parser.parse_args()

    if not os.path.isfile(args.video):
        print(f'错误: 文件不存在 - {args.video}')
        sys.exit(1)

    output_dir = args.output_dir or os.path.dirname(os.path.abspath(args.video))
    os.makedirs(output_dir, exist_ok=True)

    basename = os.path.splitext(os.path.basename(args.video))[0]

    print(f'正在从 {os.path.basename(args.video)} 提取 GPS 数据...')

    # 尝试两种提取方式
    points = None

    try:
        print('  方式 1: 使用 gopro2gpx 库...')
        points = extract_with_gopro2gpx(args.video)
        print(f'  成功! 提取了 {len(points)} 个 GPS 点')
    except Exception as e:
        print(f'  gopro2gpx 失败: {e}')
        print('  方式 2: 直接解析 GPMF 二进制数据...')
        try:
            points = extract_with_binary_parse(args.video)
            print(f'  成功! 提取了 {len(points)} 个 GPS 点')
        except Exception as e2:
            print(f'  二进制解析也失败: {e2}')
            print('\n可能的原因:')
            print('  1. 这不是 GoPro 视频文件')
            print('  2. GoPro 录制时 GPS 未启用')
            print('  3. GPS 未锁定（室内或刚开机）')
            sys.exit(1)

    # 导出文件
    if args.format in ('geojson', 'both'):
        geojson = points_to_geojson(points, args.video)
        geojson_path = os.path.join(output_dir, f'{basename}.geojson')
        with open(geojson_path, 'w') as f:
            json.dump(geojson, f)
        size_kb = os.path.getsize(geojson_path) / 1024
        print(f'\n✅ GeoJSON: {geojson_path} ({size_kb:.0f} KB)')
        print(f'   → 可直接拖入 KartPro 分析')

    if args.format in ('gpx', 'both'):
        gpx = points_to_gpx(points, args.video)
        gpx_path = os.path.join(output_dir, f'{basename}.gpx')
        with open(gpx_path, 'w') as f:
            f.write(gpx)
        size_kb = os.path.getsize(gpx_path) / 1024
        print(f'✅ GPX:     {gpx_path} ({size_kb:.0f} KB)')
        print(f'   → 可导入 Google Earth、Strava 等工具')

    print(f'\n📊 数据概要:')
    print(f'   GPS 点数: {len(points)}')

    if hasattr(points[0], 'latitude'):
        speeds = [getattr(p, 'speed', 0) or 0 for p in points]
    else:
        speeds = [p.get('speed', 0) for p in points]

    if any(s > 0 for s in speeds):
        max_speed = max(speeds) * 3.6  # m/s to km/h
        print(f'   最高速度: {max_speed:.1f} km/h')


if __name__ == '__main__':
    main()
