import React, { useEffect, useRef } from 'react';
import { Button, Space, Tooltip, Upload, message } from 'antd';
import { BoldOutlined, ItalicOutlined, UnderlineOutlined, OrderedListOutlined, UnorderedListOutlined, PictureOutlined, TableOutlined, UndoOutlined, RedoOutlined, ClearOutlined, UploadOutlined, LinkOutlined } from '@ant-design/icons';
import { api } from '../lib/api';

// Lightweight rich text editor using contentEditable and execCommand.
// Stores HTML string in the form field.
export function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }) {
  const editorRef = useRef(null);
  const lastSelectedImageRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const html = value || '';
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
      lastSelectedImageRef.current = null;
    }
  }, [value]);

  const emitChange = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onChange?.(html);
  };

  const exec = (command, arg) => {
    if (typeof document === 'undefined') return;
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const handleImage = () => {
    const url = window.prompt('Image URL');
    if (!url) return;
    exec('insertImage', url);
  };

  const handleLocalUpload = async (file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/api/cms/upload', fd);
      const url = res?.data?.url;
      if (!url) {
        throw new Error('Upload response missing url');
      }
      exec('insertImage', url);
      message.success('Image uploaded');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Image upload failed';
      message.error(msg);
    }
    // Prevent default Upload from trying to upload again
    return false;
  };

  const handleTable = () => {
    const rows = parseInt(window.prompt('Number of rows (e.g. 2)'), 10) || 2;
    const cols = parseInt(window.prompt('Number of columns (e.g. 2)'), 10) || 2;
    let html = '<table style="border-collapse:collapse;width:100%;">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<td style="border:1px solid #cbd5e1;padding:4px;">&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</table><br />';
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    emitChange();
  };

  const handleClear = () => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = '';
    emitChange();
  };

  const getSelectedImage = () => {
    if (typeof window === 'undefined' || !editorRef.current) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    while (node && node !== editorRef.current) {
      if (node.tagName === 'IMG') return node;
      node = node.parentNode;
    }
    return null;
  };

  const setImageWidth = (percent) => {
    let img = getSelectedImage();
    if (!img && lastSelectedImageRef.current && typeof document !== 'undefined' && document.contains(lastSelectedImageRef.current)) {
      img = lastSelectedImageRef.current;
    }
    if (!img) {
      message.info('Click an image first, then resize.');
      return;
    }
    img.style.width = `${percent}%`;
    img.style.height = 'auto';
    emitChange();
  };

  const handleInput = () => {
    emitChange();
  };

  const handlePaste = (e) => {
    // Paste as plain text to avoid unexpected styles.
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emitChange();
  };

  const handleClick = (e) => {
    const target = e.target;
    if (target && target.tagName === 'IMG') {
      lastSelectedImageRef.current = target;
      try {
        const range = document.createRange();
        range.selectNode(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        // ignore selection errors
      }
    }
  };

  return (
    <div className="rich-editor">
      <div className="rich-editor-toolbar">
        <Space size={4} wrap>
          <Tooltip title="Bold">
            <Button size="small" type="text" icon={<BoldOutlined />} onClick={() => exec('bold')} />
          </Tooltip>
          <Tooltip title="Italic">
            <Button size="small" type="text" icon={<ItalicOutlined />} onClick={() => exec('italic')} />
          </Tooltip>
          <Tooltip title="Underline">
            <Button size="small" type="text" icon={<UnderlineOutlined />} onClick={() => exec('underline')} />
          </Tooltip>
          <Tooltip title="Bulleted list">
            <Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={() => exec('insertUnorderedList')} />
          </Tooltip>
          <Tooltip title="Numbered list">
            <Button size="small" type="text" icon={<OrderedListOutlined />} onClick={() => exec('insertOrderedList')} />
          </Tooltip>
          <Tooltip title="Insert image from URL">
            <Button size="small" type="text" icon={<LinkOutlined />} onClick={handleImage} />
          </Tooltip>
          <Upload
            showUploadList={false}
            beforeUpload={handleLocalUpload}
            accept="image/*"
          >
            <Tooltip title="Upload image from device">
              <Button size="small" type="text" icon={<UploadOutlined />} />
            </Tooltip>
          </Upload>
          <Tooltip title="Insert table">
            <Button size="small" type="text" icon={<TableOutlined />} onClick={handleTable} />
          </Tooltip>
          <Tooltip title="Small image">
            <Button size="small" type="text" onClick={() => setImageWidth(30)}>S</Button>
          </Tooltip>
          <Tooltip title="Medium image">
            <Button size="small" type="text" onClick={() => setImageWidth(60)}>M</Button>
          </Tooltip>
          <Tooltip title="Full width image">
            <Button size="small" type="text" onClick={() => setImageWidth(100)}>L</Button>
          </Tooltip>
          <Tooltip title="Undo">
            <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => exec('undo')} />
          </Tooltip>
          <Tooltip title="Redo">
            <Button size="small" type="text" icon={<RedoOutlined />} onClick={() => exec('redo')} />
          </Tooltip>
          <Tooltip title="Clear formatting">
            <Button size="small" type="text" icon={<ClearOutlined />} onClick={handleClear} />
          </Tooltip>
        </Space>
      </div>
      <div
        ref={editorRef}
        className="rich-editor-content"
        contentEditable
        onInput={handleInput}
        onBlur={handleInput}
        onPaste={handlePaste}
        onClick={handleClick}
        data-placeholder={placeholder}
        style={{ minHeight }}
      />
    </div>
  );
}

