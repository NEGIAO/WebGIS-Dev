import os
from pathlib import Path
from PIL import Image
import sys
import io

# 强制标准输出使用 UTF-8 编码，解决 Windows GBK 报错
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
# ================= 配置区 =================
# 清理选项：如果为 True，在成功生成 WebP 后，将自动删除原有的 JPG/PNG 文件
DELETE_ORIGINAL = True

# 压缩质量 (0-100)
WEBP_QUALITY = 80
# ==========================================

def optimize_static_resources(input_dir: str, output_dir: str):
    """
    自动化图片静态资源优化脚本
    :param input_dir: 输入的图片文件夹路径
    :param output_dir: 输出的文件夹路径 (镜像结构)
    """
    in_dir_path = Path(input_dir)
    out_dir_path = Path(output_dir)
    
    # 定义需要处理的扩展名
    valid_exts = {'.jpg', '.jpeg', '.png'}
    
    # 统计面板
    stats = {'processed': 0, 'skipped': 0, 'deleted': 0, 'errors': 0}

    print(f"🚀 开始扫描目录: {in_dir_path.resolve()}")
    
    # 1. 递归扫描：使用 os.walk 遍历所有子目录
    for root, dirs, files in os.walk(input_dir):
        root_path = Path(root)
        
        for file in files:
            input_file = root_path / file
            ext = input_file.suffix.lower()
            
            # 仅处理指定格式的图片
            if ext not in valid_exts:
                continue
                
            # 2. 结构镜像：计算相对路径，并在输出目录生成对应的层级
            rel_path = input_file.relative_to(in_dir_path)
            output_file = out_dir_path / rel_path.with_suffix('.webp')
            
            # 确保对应的子目录在 output 文件夹中存在
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            # 3. 增量更新：检查是否存在，并对比修改时间 (mtime)
            if output_file.exists():
                in_mtime = input_file.stat().st_mtime
                out_mtime = output_file.stat().st_mtime
                
                # 如果输出的 webp 修改时间 晚于(>) 原图的修改时间，说明无需更新
                if out_mtime > in_mtime:
                    print(f"⏩ [跳过] 无需更新: {rel_path}")
                    stats['skipped'] += 1
                    continue

            # 开始处理单张图片
            try:
                with Image.open(input_file) as img:
                    # 4. 智能判断：颜色模式与透明度处理
                    if ext == '.png':
                        # 如果是 PNG 调色板模式(P)或带透明度的灰度图(LA)，强制转 RGBA 保护透明度
                        if img.mode in ('P', 'LA'):
                            img = img.convert('RGBA')
                        # 如果本身不是 RGB 且不是 RGBA，统一转 RGBA 以防万一
                        elif img.mode not in ('RGB', 'RGBA'):
                            img = img.convert('RGBA')
                    else:
                        # 如果是 JPG/JPEG，WebP 不需透明度，统一转换为 RGB 模式
                        if img.mode != 'RGB':
                            img = img.convert('RGB')

                    # 保存为 WebP（文件名保持同名，仅改了后缀）
                    img.save(
                        output_file, 
                        "WEBP", 
                        quality=WEBP_QUALITY, 
                        method=6  # 使用最高压缩等级
                    )
                    
                print(f"✅ [成功] 转换完成: {rel_path}")
                stats['processed'] += 1

                # 5. 清理选项：按需删除原图
                if DELETE_ORIGINAL:
                    input_file.unlink()  # 使用 pathlib 删除文件
                    print(f"   🗑️ 已删除原文件: {input_file.name}")
                    stats['deleted'] += 1

            except Exception as e:
                # 异常捕获：防止单张图损坏（如截断的JPEG）导致脚本中断
                print(f"❌ [错误] 无法处理文件 {rel_path} | 原因: {e}")
                stats['errors'] += 1

    # 打印运行简报
    print("-" * 40)
    print("🎯 任务执行完毕！统计信息如下：")
    print(f"转换成功: {stats['processed']} 张")
    print(f"增量跳过: {stats['skipped']} 张")
    print(f"异常失败: {stats['errors']} 张")
    if DELETE_ORIGINAL:
        print(f"清理原图: {stats['deleted']} 张")


if __name__ == "__main__":
    # 配置源目录与输出目录
    # 注意：如果不区分 output 目录，将其设为同 input 目录也可以实现原地转换
    SOURCE_DIRECTORY = r"D:\Dev\GitHub\WebGIS_Dev\public\images"
    OUTPUT_DIRECTORY = r"D:\Dev\GitHub\WebGIS_Dev\public\images"
    
    optimize_static_resources(SOURCE_DIRECTORY, OUTPUT_DIRECTORY)