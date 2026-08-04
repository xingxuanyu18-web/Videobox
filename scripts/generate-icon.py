"""
生成 Videobox 应用图标 (ICO)
需要: pip install Pillow
"""
from PIL import Image, ImageDraw
import math

SIZES = [16, 24, 32, 48, 64, 128, 256, 512]

def create_icon(size: int) -> Image.Image:
    """生成单个尺寸的图标"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = max(1, size // 16)
    r = max(2, size // 5)  # 圆角半径

    # 填充纯金背景
    gold = (253, 201, 65, 255)
    for y in range(margin, size - margin):
        for x in range(margin, size - margin):
            in_corner = False
            if x - margin < r and y - margin < r:
                dx, dy = x - margin - r, y - margin - r
                in_corner = dx*dx + dy*dy > r*r
            elif x - margin < r and size - margin - y < r:
                dx, dy = x - margin - r, size - margin - y - r
                in_corner = dx*dx + dy*dy > r*r
            elif size - margin - x < r and y - margin < r:
                dx, dy = size - margin - x - r, y - margin - r
                in_corner = dx*dx + dy*dy > r*r
            elif size - margin - x < r and size - margin - y < r:
                dx, dy = size - margin - x - r, size - margin - y - r
                in_corner = dx*dx + dy*dy > r*r
            if not in_corner:
                draw.point((x, y), fill=gold)

    # 绘制播放三角形（白色）
    cx = size // 2 + size // 16
    cy = size // 2
    tri_size = size // 4

    # 三角形顶点
    p1 = (cx - tri_size // 2, cy - tri_size // 2)
    p2 = (cx - tri_size // 2, cy + tri_size // 2)
    p3 = (cx + tri_size // 2, cy)

    draw.polygon([p1, p2, p3], fill=(0, 0, 0, 245))

    return img


def main():
    print("Generating Videobox icon...")
    icons = []

    for s in SIZES:
        icon = create_icon(s)
        icons.append(icon)
        print(f"  {s}x{s} OK")

    # 保存多尺寸 ICO
    output_path = "D:/1/videobox/public/videobox.ico"
    # 从大到小排列（builder 读最大尺寸验证）
    icons_reversed = list(reversed(icons))
    icons_reversed[0].save(
        output_path,
        format='ICO',
        sizes=[(img.width, img.height) for img in icons_reversed],
        append_images=icons_reversed[1:]
    )
    print(f"\nSaved: {output_path}")

    # 同时保存一个大尺寸 PNG 作为备用
    png_path = "D:/1/videobox/public/videobox-icon.png"
    icons[-1].save(png_path, format='PNG')
    print(f"Saved: {png_path}")


if __name__ == '__main__':
    main()
