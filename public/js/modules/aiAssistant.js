(function () {
  class AIAssistant {
    constructor() {
      this.elements = {};
      this.messages = {};
      this.pendingFile = null;
      this.streamingText = '';
      this.history = [];

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initialize(), { once: true });
      } else {
        this.initialize();
      }
    }

    initialize() {
      this.elements.view = document.getElementById('ai-assistant-view');
      if (!this.elements.view) {
        return;
      }

      this.elements.messages = document.getElementById('ai-chat-messages');
      this.elements.textarea = document.getElementById('ai-chat-text');
      this.elements.fileInput = document.getElementById('ai-chat-file');
      this.elements.sendButton = document.getElementById('ai-chat-send');
      this.elements.status = document.getElementById('ai-message');
      this.elements.fileInfo = document.getElementById('ai-selected-file');
      this.elements.imagePreview = document.getElementById('ai-image-preview');
      this.elements.imageName = document.getElementById('ai-image-name');
      this.elements.removeImageBtn = document.getElementById('ai-remove-image');
      this.elements.clearChatBtn = document.getElementById('ai-clear-chat');

      this.maxTextLength = parseInt(this.elements.textarea?.dataset.maxLength || '1000', 10);

      this.bindEvents();
    }

    bindEvents() {
      if (this.elements.textarea) {
        this.elements.textarea.addEventListener('input', () => this.enforceLength());
      }

      if (this.elements.fileInput) {
        this.elements.fileInput.addEventListener('change', () => this.handleFileChange());
      }

      if (this.elements.removeImageBtn) {
        this.elements.removeImageBtn.addEventListener('click', () => this.clearSelectedFile());
      }

      if (this.elements.sendButton) {
        this.elements.sendButton.addEventListener('click', () => this.handleSend());
      }

      if (this.elements.clearChatBtn) {
        this.elements.clearChatBtn.addEventListener('click', () => this.resetChat());
      }
    }

    enforceLength() {
      if (!this.elements.textarea) return;
      const value = this.elements.textarea.value;
      if (value.length > this.maxTextLength) {
        this.elements.textarea.value = value.slice(0, this.maxTextLength);
      }
    }

    async handleFileChange() {
      const file = this.elements.fileInput?.files?.[0];
      if (!file) {
        this.clearSelectedFile();
        return;
      }

      try {
        const processed = await this.compressImageIfNeeded(file);
        this.pendingFile = processed;
        const previewURL = URL.createObjectURL(processed);
        if (this.elements.fileInfo && this.elements.imagePreview && this.elements.imageName) {
          this.elements.fileInfo.classList.remove('hidden');
          this.elements.imagePreview.src = previewURL;
          this.elements.imageName.textContent = processed.name;
        }
      } catch (error) {
        console.error('[AI Assistant] 图片处理失败', error);
        this.showStatus('图片处理失败，请重试。', 'error');
        this.clearSelectedFile();
      }
    }

    clearSelectedFile() {
      if (this.elements.fileInput) {
        this.elements.fileInput.value = '';
      }
      this.pendingFile = null;
      if (this.elements.fileInfo) {
        this.elements.fileInfo.classList.add('hidden');
      }
    }

    getToken() {
      return localStorage.getItem('authToken') || localStorage.getItem('jwt');
    }

    async handleSend() {
      if (this.loading) return;

      const text = this.elements.textarea?.value?.trim() || '';
      const file = this.pendingFile || this.elements.fileInput?.files?.[0] || null;

      if (!text && !file) {
        this.showStatus('请输入文本或上传图片。', 'error');
        return;
      }

      if (text.length > this.maxTextLength) {
        this.showStatus(`文本长度请限制在 ${this.maxTextLength} 个字符以内。`, 'error');
        return;
      }

      const token = this.getToken();
      if (!token) {
        window.location.href = '/auth.html';
        return;
      }

      const formData = new FormData();
      formData.append('text', text);
      if (this.history.length) {
        formData.append('history', JSON.stringify(this.history));
      }
      if (file) {
        formData.append('file', file, file.name);
      }

      if (this.elements.textarea) {
        this.elements.textarea.value = '';
      }

      const userMessageId = this.appendMessage('user', {
        text: text || '[仅图片提问]',
        imageName: file ? file.name : ''
      });
      const aiMessageId = this.appendMessage('ai', {
        text: 'AI 正在思考…',
        loading: true
      });

      // 将当前用户消息暂存入历史（不含图片预览名）
      if (text) {
        this.history.push({ role: 'user', content: text });
      } else {
        this.history.push({ role: 'user', content: '[仅图片提问]' });
      }

      this.streamingText = '';
      this.setLoading(true);
      this.showStatus('AI 正在思考…', 'info');

      try {
        const response = await fetch('/api/ai/explain/stream', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });

        if (response.status === 401) {
          window.location.href = '/auth.html';
          return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
          const payload = await this.consumeStream(response.body, aiMessageId);
          if (!payload?.success) {
            const errorMessage = this.getErrorMessage(payload?.error?.code, payload?.error?.message);
            this.updateMessage(aiMessageId, `<div class="ai-bubble">❌ ${this.escapeHTML(errorMessage)}</div>`);
            throw new Error(errorMessage);
          }
          this.renderAiMessage(aiMessageId, payload.data);
          this.pushAiHistory(payload.data);
          this.streamingText = '';
        } else {
          const json = await response.json().catch(() => null);
          if (!json || !json.success) {
            const errorMessage = this.getErrorMessage(json?.error?.code, json?.error?.message);
            this.updateMessage(aiMessageId, `<div class="ai-bubble">❌ ${this.escapeHTML(errorMessage)}</div>`);
            throw new Error(errorMessage);
          }
          this.renderAiMessage(aiMessageId, json.data);
          this.pushAiHistory(json.data);
        }
      } catch (error) {
        console.error('[AI Assistant] 提交失败', error);
        this.streamingText = '';
        this.updateMessage(aiMessageId, `<div class="ai-bubble">❌ ${this.escapeHTML(error.message || 'AI 讲解服务暂时不可用，请稍后重试。')}</div>`);
      } finally {
        this.setLoading(false);
        this.streamingText = '';
        if (this.elements.textarea) {
          this.elements.textarea.value = '';
        }
        this.clearSelectedFile();
        this.showStatus('', '');
      }
    }

    pushAiHistory(data) {
      if (!data || !data.explain) return;
      const explainContent = typeof data.explain === 'string'
        ? data.explain
        : data.explain?.content;

      if (typeof explainContent === 'string' && explainContent.trim()) {
        this.history.push({ role: 'assistant', content: explainContent.trim() });
      }
    }

    async consumeStream(body, aiMessageId) {
      if (!body) {
        throw new Error('AI 讲解服务暂时不可用，请稍后重试。');
      }

      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let finalPayload = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          if (!raw.startsWith('data:')) continue;

          const dataStr = raw.slice(5).trim();
          if (!dataStr) continue;

          let event;
          try {
            event = JSON.parse(dataStr);
          } catch (parseError) {
            console.error('[AI Assistant] SSE 解析失败', parseError);
            continue;
          }

          if (event.type === 'chunk' && typeof event.content === 'string') {
            this.streamingText = (this.streamingText || '') + event.content;
            if (this.streamingText.length > 1500) {
              this.streamingText = this.streamingText.slice(this.streamingText.length - 1500);
            }
            const previewHtml = this.formatMultiline(this.streamingText) || this.escapeHTML('AI 正在思考…');
            this.updateMessage(
              aiMessageId,
              `<div class="ai-bubble">${previewHtml}</div>`
            );
          } else if (event.type === 'done') {
            finalPayload = event.payload;
          } else if (event.type === 'error') {
            throw new Error(event.error?.message || 'AI 讲解服务暂时不可用，请稍后重试。');
          }
        }
      }

      if (!finalPayload) {
        throw new Error('AI 讲解服务未返回结果，请稍后重试。');
      }

      this.streamingText = '';
      return finalPayload;
    }

    appendMessage(role, { text = '', loading = false, imageName = '' } = {}) {
      if (!this.elements.messages) return null;
      const id = `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const wrapper = document.createElement('div');
      wrapper.className = `ai-message ai-${role}`;

      const bubble = document.createElement('div');
      bubble.className = 'ai-bubble';
      bubble.innerHTML = loading ? this.formatMultiline(text) : this.formatText(text, imageName);

      wrapper.dataset.messageId = id;
      wrapper.appendChild(bubble);
      this.elements.messages.appendChild(wrapper);
      this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
      this.messages[id] = wrapper;
      return id;
    }

    formatText(text, imageName) {
      let content = this.formatMultiline(text);
      if (imageName) {
        content += `<div class="ai-meta">📷 ${this.escapeHTML(imageName)}</div>`;
      }
      return content || '[空]';
    }

    updateMessage(id, html) {
      const wrapper = this.messages[id];
      if (!wrapper) return;
      wrapper.innerHTML = html;
      if (this.elements.messages) {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
      }
    }

    renderAiMessage(messageId, data) {
      if (!data || !data.explain) {
        this.updateMessage(messageId, `<div class="ai-bubble">❌ AI 未返回结果，请稍后重试。</div>`);
        return;
      }

      const explainContent = typeof data.explain === 'string'
        ? data.explain
        : data.explain?.content;

      const text = typeof explainContent === 'string' && explainContent.trim()
        ? explainContent
        : 'AI 未提供详细信息。';
      const formatted = this.formatMultiline(text);
      this.updateMessage(messageId, `<div class="ai-bubble">${formatted}</div>`);
    }

    resetChat() {
      this.history = [];
      this.streamingText = '';
      this.messages = {};

      if (this.elements.messages) {
        this.elements.messages.innerHTML = `
          <div class="ai-message ai-bot">
            <div class="ai-bubble">
              こんにちは！输入日文或中文句子，也可以上传教材/练习照片，我会帮你识别并讲解语法。
            </div>
          </div>`;
      }

      if (this.elements.textarea) {
        this.elements.textarea.value = '';
      }
      this.clearSelectedFile();
      this.showStatus('', '');
    }

    showStatus(message, type = 'info') {
      if (!this.elements.status) return;
      this.elements.status.textContent = message;
      this.elements.status.className = type ? `ai-message ${type}` : 'ai-message';
    }

    setLoading(isLoading) {
      this.loading = isLoading;
      if (this.elements.sendButton) {
        this.elements.sendButton.disabled = isLoading;
        this.elements.sendButton.textContent = '发送';
      }
    }

    getErrorMessage(code, fallback) {
      const map = {
        NO_INPUT: '请输入文本或上传图片。',
        NO_TEXT_FROM_IMAGE: '未识别到可用文字，请尝试更清晰的图片。',
        IMAGE_TOO_LARGE: '图片大小超过限制，请压缩后再试。',
        INVALID_IMAGE: '仅支持 JPG / PNG 等常见图片格式。',
        OCR_FAILED: '图片识别失败，请稍后再试。',
        LLM_ERROR: 'AI 讲解服务暂时不可用，请稍后再试。',
        AI_FEATURE_DISABLED: 'AI 服务尚未配置，请稍后再试。'
      };
      return map[code] || fallback || 'AI 讲解服务暂时不可用，请稍后重试。';
    }

    escapeHTML(value = '') {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    formatMultiline(text = '') {
      return this.renderMarkdown(text);
    }

    renderMarkdown(text = '') {
      if (!text) return '';

      const codeBlocks = [];
      const placeholder = (i) => `@@CODEBLOCK${i}@@`;

      // 提取代码块
      let tmp = text.replace(/```([\s\S]*?)```/g, (_, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(code);
        return placeholder(idx);
      });

      // 按行处理
      const lines = tmp.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const htmlParts = [];
      let i = 0;

      const inlineMd = (str) => {
        let s = this.escapeHTML(str);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return s;
      };

      const isTableHeaderSep = (line) => /^[:\-\s\|]+$/.test(line);
      const isTableRow = (line) => /\|/.test(line);

      while (i < lines.length) {
        const line = lines[i].trim();
        if (!line) {
          i += 1;
          continue;
        }

        // 标题
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          const level = Math.min(6, headingMatch[1].length);
          htmlParts.push(`<h${level}>${inlineMd(headingMatch[2])}</h${level}>`);
          i += 1;
          continue;
        }

        // 表格
        if (isTableRow(line) && i + 1 < lines.length && isTableHeaderSep(lines[i + 1].trim())) {
          const headerCells = line.split('|').map(c => c.trim()).filter(Boolean);
          const rows = [];
          i += 2; // skip header & separator
          while (i < lines.length && isTableRow(lines[i].trim())) {
            rows.push(lines[i].trim().split('|').map(c => c.trim()));
            i += 1;
          }
          const thead = `<thead><tr>${headerCells.map(c => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead>`;
          const tbody = rows.length
            ? `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
            : '';
          htmlParts.push(`<table class="ai-table">${thead}${tbody}</table>`);
          continue;
        }

        // 有序列表
        if (/^\d+\.\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
            items.push(`<li>${inlineMd(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
            i += 1;
          }
          htmlParts.push(`<ol>${items.join('')}</ol>`);
          continue;
        }

        // 无序列表
        if (/^[-*+]\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
            items.push(`<li>${inlineMd(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
            i += 1;
          }
          htmlParts.push(`<ul>${items.join('')}</ul>`);
          continue;
        }

        // 段落（连续非空、非列表、非标题行）
        const paraLines = [line];
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() &&
          !/^(#{1,6})\s+/.test(lines[i].trim()) &&
          !/^\d+\.\s+/.test(lines[i].trim()) &&
          !/^[-*+]\s+/.test(lines[i].trim())
        ) {
          paraLines.push(lines[i].trim());
          i += 1;
        }
        htmlParts.push(`<p>${inlineMd(paraLines.join(' '))}</p>`);
      }

      let html = htmlParts.join('');
      html = html.replace(/@@CODEBLOCK(\d+)@@/g, (_, idx) => {
        const code = this.escapeHTML(codeBlocks[Number(idx)] || '');
        return `<pre><code>${code}</code></pre>`;
      });

      return html;
    }

    compressImageIfNeeded(file) {
      const maxBytes = 1024 * 1024;
      if (file.size <= maxBytes) {
        return Promise.resolve(file);
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, Math.sqrt((1024 * 1024) / file.size));
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
              blob => {
                if (!blob) {
                  reject(new Error('压缩图片失败'));
                  return;
                }
                resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
              },
              'image/jpeg',
              0.8
            );
          };
          img.onerror = reject;
          img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  }

  window.aiAssistant = new AIAssistant();
})();
