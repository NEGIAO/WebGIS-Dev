import os
import sys
import io
from pathlib import Path

# 强制设置控制台输出为 UTF-8，解决中文及特殊字符乱码问题
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def generate_markdown_tree(root_dir, output_file="FileTree.md", ignore_list=None):
    """
    生成目录树并写入 Markdown。
    逻辑优化：仅在文件夹处理完毕后增加分割线，同级文件间不增加。
    """
    if ignore_list is None:
        # 排除非业务目录
        ignore_list = {'.git', '.venv','data','node_modules', 'tiles', '__pycache__', '.DS_Store', 'dist', '.vscode', '.idea', 'venv'}

    output = []
    root_path = Path(root_dir).resolve()

    def _build_tree(current_path, prefix=""):
        try:
            # 排序：文件夹在前，文件在后
            items = sorted(
                [p for p in current_path.iterdir() if p.name not in ignore_list],
                key=lambda p: (not p.is_dir(), p.name.lower())
            )
        except PermissionError:
            return

        count = len(items)
        for i, item in enumerate(items):
            is_last = (i == count - 1)
            connector = "└── " if is_last else "├── "
            
            # 1. 正常写入当前项
            line_name = f"{item.name}/" if item.is_dir() else item.name
            line = f"{prefix}{connector}{line_name}"
            formatted_line = f"{line.ljust(50)} # "
            output.append(formatted_line)

            # 2. 如果是文件夹，递归进入
            if item.is_dir():
                extension = "    " if is_last else "│   "
                _build_tree(item, prefix + extension)
                
                # 3. 【逻辑修正】分割线判断：
                # 只有当刚才处理完的是一个文件夹，并且它后面还有同级兄弟节点时，才加空行
                if not is_last:
                    # 这里的空行需要延续父级的垂直线
                    spacer = f"{prefix}│".ljust(50) + " # "
                    output.append(spacer)

    # 写入根节点
    output.append(f"{root_path.name}/".ljust(50) + " # ")
    _build_tree(root_path)
    
    md_content = "```text\n" + "\n".join(output) + "\n```"
    
    # 显式指定 UTF-8 编码，彻底解决 GBK 报错问题
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(md_content)
        print(f" 成功！结构化文件树已生成至: {os.path.abspath(output_file)}")
    except Exception as e:
        print(f"写入文件失败 (检查是否编码冲突或文件被占用): {e}")

if __name__ == "__main__":
    # 目标目录
    target_dir = "D:\\Dev\\GitHub\\WebGIS_Dev\\backend" 
    
    generate_markdown_tree(target_dir)