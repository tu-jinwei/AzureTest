import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, message, Typography } from 'antd';
import { MailOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const { Title, Text, Link } = Typography;

const Login = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [step, setStep] = useState(1); // 1: 輸入 Email, 2: 輸入 OTP
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [detail, setDetail] = useState('');

  // 如果已登入，跳轉到首頁
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // 倒數計時器
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Step 1: 取得驗證碼
  const handleRequestOTP = useCallback(async () => {
    if (!email || !email.trim()) {
      message.warning('請輸入 Email');
      return;
    }

    // 簡單的 email 格式驗證
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      message.warning('請輸入有效的 Email 格式');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.requestOTP(email.trim());
      message.success(response.data.message || 'OTP 已寄送至您的 Email');
      setDetail(response.data.detail || '');
      setStep(2);
      setCountdown(60);
      // 開發模式：後端回傳 dev_otp 時自動填入
      if (response.data.dev_otp) {
        setOtpCode(response.data.dev_otp);
        message.info(`[DEV] OTP 已自動填入: ${response.data.dev_otp}`, 5);
      } else {
        setOtpCode('');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || '發送驗證碼失敗，請稍後再試';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [email]);

  // Step 2: 驗證 OTP 並登入
  const handleVerifyOTP = useCallback(async () => {
    if (!otpCode || otpCode.trim().length < 6) {
      message.warning('請輸入 6 位數驗證碼');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.verifyOTP(email.trim(), otpCode.trim());
      const { access_token, user } = response.data;

      // 儲存 token 並更新 AuthContext
      login(access_token, user);
      message.success('登入成功！');
      navigate('/', { replace: true });
    } catch (error) {
      const errorMsg = error.response?.data?.detail || '驗證碼錯誤或已過期';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [email, otpCode, login, navigate]);

  // 重新發送驗證碼
  const handleResendOTP = useCallback(async () => {
    if (countdown > 0) return;

    setLoading(true);
    try {
      const response = await authAPI.requestOTP(email.trim());
      message.success(response.data.message || 'OTP 已重新寄送');
      setDetail(response.data.detail || '');
      setCountdown(60);
      // 開發模式：後端回傳 dev_otp 時自動填入
      if (response.data.dev_otp) {
        setOtpCode(response.data.dev_otp);
        message.info(`[DEV] OTP 已自動填入: ${response.data.dev_otp}`, 5);
      } else {
        setOtpCode('');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || '重新發送失敗，請稍後再試';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [email, countdown]);

  // 返回 Step 1
  const handleBackToEmail = () => {
    setStep(1);
    setOtpCode('');
    setCountdown(0);
    setDetail('');
  };

  // 遮蔽 email 顯示
  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
    : '';

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo 區域 */}
        <div className="login-header">
          <div className="login-logo">
            <SafetyCertificateOutlined className="login-logo-icon" />
          </div>
          <Title level={3} className="login-title">
            CTBC AI Portal
          </Title>
          <Text className="login-subtitle">中國信託 AI 智能平台</Text>
        </div>

        {/* Step 1: 輸入 Email */}
        {step === 1 && (
          <div className="login-form">
            <div className="login-field">
              <label className="login-label">Email</label>
              <Input
                size="large"
                placeholder="請輸入您的 Email"
                prefix={<MailOutlined style={{ color: '#bbb' }} />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onPressEnter={handleRequestOTP}
                autoFocus
              />
            </div>
            <Button
              type="primary"
              size="large"
              block
              loading={loading}
              onClick={handleRequestOTP}
              className="login-btn"
            >
              取得驗證碼
            </Button>
          </div>
        )}

        {/* Step 2: 輸入 OTP */}
        {step === 2 && (
          <div className="login-form">
            <div className="login-otp-info">
              <Text type="secondary">
                驗證碼已寄送至 <strong>{maskedEmail}</strong>
              </Text>
            </div>
            <div className="login-field">
              <label className="login-label">驗證碼</label>
              <Input
                size="large"
                placeholder="請輸入 6 位數驗證碼"
                prefix={<LockOutlined style={{ color: '#bbb' }} />}
                value={otpCode}
                onChange={(e) => {
                  // 只允許數字，最多 6 位
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtpCode(val);
                }}
                onPressEnter={handleVerifyOTP}
                maxLength={6}
                autoFocus
              />
            </div>
            <Button
              type="primary"
              size="large"
              block
              loading={loading}
              onClick={handleVerifyOTP}
              className="login-btn"
              disabled={otpCode.length < 6}
            >
              登入
            </Button>
            <div className="login-actions">
              <Link
                onClick={handleResendOTP}
                disabled={countdown > 0}
                className="login-resend"
              >
                {countdown > 0
                  ? `重新發送驗證碼 (${countdown}s)`
                  : '重新發送驗證碼'}
              </Link>
              <Link onClick={handleBackToEmail} className="login-back">
                返回
              </Link>
            </div>
          </div>
        )}

        {/* 開發模式提示 */}
        <div className="login-dev-hint">
          <Text type="secondary" style={{ fontSize: 12 }}>
            開發模式：OTP 會顯示在後端 console
          </Text>
          {detail && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Detail: {detail}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
