// 认证页面JavaScript
class AuthManager {
    constructor() {
        this.currentForm = 'login';
        this.userEmail = '';
        this.resetCode = null; // 存储重置密码的验证码
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
    }

    bindEvents() {
        // 表单切换事件
        const showRegisterBtn = document.getElementById('show-register');
        if (showRegisterBtn) {
            showRegisterBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForm('register');
            });
        }

        const showLoginBtn = document.getElementById('show-login');
        if (showLoginBtn) {
            showLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForm('login');
            });
        }

        const showForgotPasswordBtn = document.getElementById('show-forgot-password');
        if (showForgotPasswordBtn) {
            showForgotPasswordBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForm('forgot-password');
            });
        }

        const backToLoginBtn = document.getElementById('back-to-login');
        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForm('login');
            });
        }

        const backToRegisterBtn = document.getElementById('back-to-register');
        if (backToRegisterBtn) {
            backToRegisterBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForm('register');
            });
        }

        const backToForgotBtn = document.getElementById('back-to-forgot');
        if (backToForgotBtn) {
            backToForgotBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForm('forgot-password');
            });
        }

        const backToResetVerifyBtn = document.getElementById('back-to-reset-verify');
        if (backToResetVerifyBtn) {
            backToResetVerifyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForm('reset-verify');
            });
        }

        // 表单提交事件
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleForgotPassword();
            });
        }

        const verifyEmailForm = document.getElementById('verifyEmailForm');
        if (verifyEmailForm) {
            verifyEmailForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleVerifyEmail();
            });
        }

        const resetVerifyForm = document.getElementById('resetVerifyForm');
        if (resetVerifyForm) {
            resetVerifyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleResetVerify();
            });
        }

        const resetPasswordForm = document.getElementById('resetPasswordForm');
        if (resetPasswordForm) {
            resetPasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleResetPassword();
            });
        }

        // 重新发送验证码
        const resendCodeBtn = document.getElementById('resend-code');
        if (resendCodeBtn) {
            resendCodeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.resendVerificationCode();
            });
        }

        // 重新发送重置验证码
        const resendResetCodeBtn = document.getElementById('resend-reset-code');
        if (resendResetCodeBtn) {
            resendResetCodeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.resendResetCode();
            });
        }

        // 验证码输入框自动格式化
        const codeInputs = ['verification-code', 'reset-verification-code'];
        codeInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
                });
            }
        });
    }

    showForm(formName) {
        // 隐藏所有表单
        const authForms = document.querySelectorAll('.auth-form');
        if (authForms && authForms.length > 0) {
            authForms.forEach(form => {
                form.classList.remove('active');
            });
        }

        // 显示指定表单
        document.getElementById(`${formName}-form`).classList.add('active');
        this.currentForm = formName;

        // 清除表单错误状态
        this.clearFormErrors();
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!this.validateEmail(email)) {
            this.showError('请输入有效的邮箱地址');
            return;
        }

        if (!password) {
            this.showError('请输入密码');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // 保存token
                localStorage.setItem('authToken', data.token);
                this.showSuccess('登录成功！');
                
                // 跳转到主页
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 1000);
            } else {
                this.showError(data.message || '登录失败');
            }
        } catch (error) {
            // console.error('Login error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async handleRegister() {
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;

        if (!this.validateEmail(email)) {
            this.showError('请输入有效的邮箱地址');
            return;
        }

        if (password.length < 6) {
            this.showError('密码长度至少6位');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('两次输入的密码不一致');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.userEmail = email;
                this.showSuccess('注册成功！请查收邮箱验证码');
                this.showForm('verify-email');
            } else {
                this.showError(data.message || '注册失败');
            }
        } catch (error) {
            // console.error('Register error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async handleForgotPassword() {
        const email = document.getElementById('forgot-email').value.trim();

        if (!this.validateEmail(email)) {
            this.showError('请输入有效的邮箱地址');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok) {
                this.userEmail = email;
                this.showSuccess('重置验证码已发送！');
                this.showForm('reset-verify');
            } else {
                this.showError(data.message || '发送失败');
            }
        } catch (error) {
            // console.error('Forgot password error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async handleVerifyEmail() {
        const code = document.getElementById('verification-code').value.trim();

        if (code.length !== 4) {
            this.showError('请输入4位验证码');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/auth/verify-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: this.userEmail, code })
            });

            const data = await response.json();

            if (response.ok) {
                // 保存token
                localStorage.setItem('authToken', data.token);
                this.showSuccess('邮箱验证成功！');
                
                // 跳转到主页
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 1000);
            } else {
                this.showError(data.message || '验证失败');
            }
        } catch (error) {
            // console.error('Verify email error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async handleResetVerify() {
        const code = document.getElementById('reset-verification-code').value.trim();

        if (code.length !== 4) {
            this.showError('请输入4位验证码');
            return;
        }

        if (!this.userEmail) {
            this.showError('请先申请密码重置');
            return;
        }

        this.showLoading(true);

        try {
            // 验证重置验证码（这里只验证，不重置密码）
            const response = await fetch('/api/auth/verify-reset-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: this.userEmail, code })
            });

            const data = await response.json();

            if (response.ok) {
                this.resetCode = code;
                this.showSuccess('验证码验证成功！');
                
                // 设置隐藏字段的值
                document.getElementById('reset-email').value = this.userEmail;
                document.getElementById('reset-code').value = code;
                
                // 跳转到重置密码表单
                this.showForm('reset-password');
            } else {
                this.showError(data.message || '验证失败');
            }
        } catch (error) {
            // console.error('Reset verify error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async handleResetPassword() {
        const password = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;

        if (password.length < 6) {
            this.showError('密码长度至少6位');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('两次输入的密码不一致');
            return;
        }

        if (!this.userEmail || !this.resetCode) {
            this.showError('请先验证邮箱和验证码');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    email: this.userEmail,
                    code: this.resetCode, 
                    newPassword: password 
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('密码重置成功！');
                setTimeout(() => {
                    this.showForm('login');
                }, 1000);
            } else {
                this.showError(data.message || '重置失败');
            }
        } catch (error) {
            // console.error('Reset password error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async resendVerificationCode() {
        if (!this.userEmail) {
            this.showError('请先完成注册');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: this.userEmail })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('验证码已重新发送！');
            } else {
                this.showError(data.message || '发送失败');
            }
        } catch (error) {
            // console.error('Resend verification error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async resendResetCode() {
        if (!this.userEmail) {
            this.showError('请先申请密码重置');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: this.userEmail })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('重置验证码已重新发送！');
            } else {
                this.showError(data.message || '发送失败');
            }
        } catch (error) {
            // console.error('Resend reset code error:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.showLoading(false);
        }
    }

    async checkAuthStatus() {
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                const response = await fetch('/api/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    // 用户已登录，跳转到主页
                    window.location.href = '/index.html';
                    return;
                }
            } catch (error) {
                // console.error('Auth check error:', error);
            }
            
            // Token无效，清除
            localStorage.removeItem('authToken');
        }
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.classList.add('show');
        } else {
            loading.classList.remove('show');
        }
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showInfo(message) {
        this.showToast(message, 'info');
    }

    clearFormErrors() {
        const formGroups = document.querySelectorAll('.form-group');
        if (formGroups && formGroups.length > 0) {
            formGroups.forEach(group => {
                group.classList.remove('error');
            });
        }
    }
}

// 初始化认证管理器
document.addEventListener('DOMContentLoaded', () => {
    const authManager = new AuthManager();
    
    // 处理URL路由
    const hash = window.location.hash.slice(1);
    
    if (hash) {
        authManager.showForm(hash);
    } else {
        // 默认显示登录表单
        authManager.showForm('login');
    }
});