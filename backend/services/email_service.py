"""
Email 寄送服務：使用 aiosmtplib 非同步寄送 OTP 驗證碼
支援 Office365 / Azure Communication Services SMTP
"""
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from config import settings

logger = logging.getLogger(__name__)


def _build_otp_html(otp_code: str, email: str, expire_minutes: int = 10) -> str:
    """產生 OTP 驗證碼 HTML Email 內容"""
    return f"""\
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI','Microsoft JhengHei',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background-color:#ffffff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a73e8,#0d47a1);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:1px;">
                🔐 CTBC AI Portal
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                登入驗證碼 / Login Verification Code
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 20px;">
              <p style="margin:0 0 8px;color:#333;font-size:15px;">您好，</p>
              <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6;">
                您正在登入 CTBC AI Portal，以下是您的一次性驗證碼：
              </p>
              <!-- OTP Code -->
              <div style="text-align:center;margin:0 0 24px;">
                <div style="display:inline-block;background:#f0f4ff;border:2px dashed #1a73e8;border-radius:10px;padding:18px 48px;">
                  <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#1a73e8;font-family:'Courier New',monospace;">
                    {otp_code}
                  </span>
                </div>
              </div>
              <p style="margin:0 0 6px;color:#888;font-size:13px;text-align:center;">
                ⏱ 此驗證碼將於 <strong>{expire_minutes} 分鐘</strong>後失效
              </p>
              <p style="margin:0 0 24px;color:#888;font-size:13px;text-align:center;">
                This code will expire in <strong>{expire_minutes} minutes</strong>.
              </p>
            </td>
          </tr>
          <!-- Security Notice -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#fff8e1;border-left:4px solid #ffc107;border-radius:4px;padding:14px 16px;">
                <p style="margin:0;color:#795548;font-size:12px;line-height:1.6;">
                  ⚠️ 安全提醒：請勿將驗證碼分享給任何人。CTBC 不會主動向您索取驗證碼。<br>
                  Security Notice: Never share this code with anyone. CTBC will never ask for your verification code.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;color:#aaa;font-size:11px;">
                此信件由系統自動發送，請勿直接回覆。<br>
                This is an automated message. Please do not reply.
              </p>
              <p style="margin:8px 0 0;color:#ccc;font-size:10px;">
                © 2026 CTBC AI Portal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_otp_plain(otp_code: str, email: str, expire_minutes: int = 10) -> str:
    """產生 OTP 驗證碼純文字 Email 內容（fallback）"""
    return (
        f"CTBC AI Portal - 登入驗證碼\n"
        f"{'=' * 40}\n\n"
        f"您好，\n\n"
        f"您正在登入 CTBC AI Portal，以下是您的一次性驗證碼：\n\n"
        f"    {otp_code}\n\n"
        f"此驗證碼將於 {expire_minutes} 分鐘後失效。\n"
        f"This code will expire in {expire_minutes} minutes.\n\n"
        f"⚠️ 安全提醒：請勿將驗證碼分享給任何人。\n"
        f"Security Notice: Never share this code with anyone.\n\n"
        f"{'=' * 40}\n"
        f"此信件由系統自動發送，請勿直接回覆。\n"
    )


async def send_otp_email(to_email: str, otp_code: str) -> bool:
    """
    寄送 OTP 驗證碼 Email

    Args:
        to_email: 收件者 Email
        otp_code: OTP 驗證碼

    Returns:
        bool: 是否寄送成功
    """
    # 檢查 SMTP 設定是否完整
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning(
            "SMTP 設定不完整 (SMTP_USER 或 SMTP_PASSWORD 為空)，無法寄送 Email。"
            "請在 .env 中設定 SMTP_USER 和 SMTP_PASSWORD。"
        )
        return False

    expire_minutes = settings.OTP_EXPIRE_MINUTES
    smtp_from = settings.SMTP_FROM or settings.SMTP_USER

    # 建立 MIME 訊息
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"CTBC AI Portal - 登入驗證碼 {otp_code[:2]}****"
    msg["From"] = smtp_from
    msg["To"] = to_email

    # 純文字版本（fallback）
    plain_body = _build_otp_plain(otp_code, to_email, expire_minutes)
    msg.attach(MIMEText(plain_body, "plain", "utf-8"))

    # HTML 版本
    html_body = _build_otp_html(otp_code, to_email, expire_minutes)
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
            timeout=30,
        )
        logger.info(f"OTP Email 已成功寄送至 {to_email}")
        return True

    except aiosmtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP 認證失敗: {e}")
        return False
    except aiosmtplib.SMTPConnectError as e:
        logger.error(f"SMTP 連線失敗: {e}")
        return False
    except aiosmtplib.SMTPException as e:
        logger.error(f"SMTP 寄送失敗: {e}")
        return False
    except Exception as e:
        logger.error(f"Email 寄送發生未預期錯誤: {e}", exc_info=True)
        return False
