"""
Videobox 激活码生成器
用法: python scripts/generate-key.py pro    (买断版)
      python scripts/generate-key.py premium (订阅版)
"""
import hashlib
import sys
import random
import string

SECRET = "videobox-2026-gold-key-secret"

def generate_key(tier: str) -> str:
    tier_map = {"pro": "PRO", "premium": "PRE"}
    code = tier_map.get(tier.lower(), "PRO")

    # 随机段
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    seg1 = ''.join(random.choices(chars, k=4))
    seg2 = ''.join(random.choices(chars, k=4))
    seg3 = ''.join(random.choices(chars, k=4))
    seg4 = ''.join(random.choices(chars, k=4))

    # 签名 = hash(seg1-seg2-seg3-seg4-CODE + secret) 的前8位
    payload = f"{seg1}-{seg2}-{seg3}-{seg4}-{code}-{SECRET}"
    sig = hashlib.sha256(payload.encode()).hexdigest()[:8].upper()

    return f"VB-{seg1}-{seg2}-{seg3}-{seg4}-{code}-{sig}"

def verify_key(key: str) -> dict:
    """验证激活码是否有效"""
    parts = key.strip().upper().split('-')
    if len(parts) != 7 or parts[0] != 'VB':
        return {"valid": False, "reason": "格式无效"}

    seg1, seg2, seg3, seg4, code, sig = parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]

    if code not in ('PRO', 'PRE'):
        return {"valid": False, "reason": "类型无效"}

    # 验证签名
    payload = f"{seg1}-{seg2}-{seg3}-{seg4}-{code}-{SECRET}"
    expected = hashlib.sha256(payload.encode()).hexdigest()[:8].upper()

    if sig != expected:
        return {"valid": False, "reason": "签名无效"}

    tier = "pro" if code == "PRO" else "premium"
    return {"valid": True, "tier": tier, "key": key}

if __name__ == '__main__':
    tier = sys.argv[1] if len(sys.argv) > 1 else 'pro'
    key = generate_key(tier)
    print(f"\n  {'='*50}")
    print(f"  Videobox 激活码")
    print(f"  {'='*50}")
    print(f"\n  {key}")
    print(f"\n  类型: {'Pro 买断' if tier == 'pro' else 'Premium 订阅'}")
    print(f"  在软件 → 许可证 → 输入激活码\n")

    # 验证自测
    result = verify_key(key)
    print(f"  自检: {'通过' if result['valid'] else '失败: ' + result.get('reason','')}")
    print()
