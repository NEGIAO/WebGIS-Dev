"""
邮件发送服务 — 基于 SMTP 协议发送验证码邮件。

使用 Python 内置 smtplib + email 模块，无需额外依赖。
配置通过环境变量读取：SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD。
"""

import logging
import os
import smtplib
import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from dotenv import load_dotenv

load_dotenv(override=False)

logger = logging.getLogger(__name__)

# SMTP 配置（从环境变量读取，开发模式下从 .env 加载）
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")

# 验证码用途中文映射
_PURPOSE_LABELS = {
    "register": "注册账号",
    "reset_password": "重置密码",
    "bind_email": "绑定邮箱",
}


def _build_verification_html(code: str, purpose: str, expire_minutes: int = 5) -> str:
    """构建验证码邮件的 HTML 内容。"""
    purpose_label = _PURPOSE_LABELS.get(purpose, "验证身份")

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7f5; font-family: 'Segoe UI', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7f5; padding: 40px 0;">
            <tr>
                <td align="center">
                    <table width="480" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
                        <tr>
                            <td style="background: linear-gradient(135deg, #2f9a57, #1a7a3a); padding: 28px 32px; text-align: center;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                                    🌍 NEGIAO's WebGIS
                                </h1>
                                <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">
                                    邮箱验证码 — {purpose_label}
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 32px;">
                                <p style="color: #333; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
                                    您好，您正在进行<strong>{purpose_label}</strong>操作，验证码如下：
                                </p>
                                <div style="background: #f0faf4; border: 2px dashed #2f9a57; border-radius: 10px; padding: 20px; text-align: center; margin: 0 0 24px;">
                                    <span style="font-size: 36px; font-weight: 800; color: #2f9a57; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                        {code}
                                    </span>
                                </div>
                                <p style="color: #666; font-size: 13px; line-height: 1.6; margin: 0 0 8px;">
                                    ⏰ 验证码有效期为 <strong>{expire_minutes} 分钟</strong>，请尽快使用。
                                </p>
                                <p style="color: #999; font-size: 12px; line-height: 1.5; margin: 0;">
                                    如果您没有进行此操作，请忽略此邮件，您的账号安全不受影响。
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="background: #f8f9fa; padding: 16px 32px; text-align: center; border-top: 1px solid #eee;">
                                <p style="color: #aaa; font-size: 11px; margin: 0;">
                                    此邮件由系统自动发送，请勿直接回复 · NEGIAO's WebGIS
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


def _send_email_sync(to_email: str, subject: str, html_body: str, plain_code: str = "") -> bool:
    """
    同步发送 HTML 邮件（通过 SMTP 587 + STARTTLS）。
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.error("SMTP 配置不完整：SMTP_USER 或 SMTP_PASSWORD 未设置")
        return False

    # 构建邮件
    msg = MIMEMultipart("alternative")
    msg["From"] = formataddr(("WebGIS", SMTP_USER))
    msg["To"] = to_email
    msg["Subject"] = subject

    if plain_code:
        text_body = f"您的验证码是：{plain_code}，有效期 5 分钟。请勿泄露给他人。"
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    # 发送（与桌面端测试脚本完全一致的协议）
    server = None
    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, [to_email], msg.as_string())
        logger.info("验证码邮件已发送至 %s", to_email)
        return True
    except Exception as e:
        logger.error("邮件发送失败: %s (类型: %s)", str(e), type(e).__name__)
        return False
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


async def send_verification_email(
    to_email: str,
    code: str,
    purpose: str,
    expire_minutes: int = 5,
) -> bool:
    """异步发送验证码邮件。"""
    purpose_label = _PURPOSE_LABELS.get(purpose, "验证身份")
    subject = f"【WebGIS】{purpose_label}验证码：{code}"
    html_body = _build_verification_html(code, purpose, expire_minutes)

    return await asyncio.to_thread(_send_email_sync, to_email, subject, html_body, code)


def check_smtp_configured() -> bool:
    """检查 SMTP 配置是否完整。"""
    return bool(SMTP_USER and SMTP_PASSWORD)
