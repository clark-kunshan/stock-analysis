import { useState, useRef, useEffect } from 'react';

interface EditableCellProps {
  value: string | number;
  onChange: (value: any) => void;
  type?: 'text' | 'number';
  className?: string;
  readOnly?: boolean;
  title?: string;
}

export function EditableCell({ value, onChange, type = 'text', className = '', readOnly = false, title }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(String(value));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleBlur = () => {
    setEditing(false);
    if (type === 'number') {
      const num = parseFloat(editValue);
      onChange(isNaN(num) ? 0 : num);
    } else {
      onChange(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setEditValue(String(value));
      setEditing(false);
    }
  };

  if (readOnly) {
    return <td className={`formula-cell ${className}`} title={title}>{value}</td>;
  }

  if (editing) {
    return (
      <td className={className}>
        <input
          ref={inputRef}
          type={type === 'number' ? 'number' : 'text'}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-sm outline-none"
          step={type === 'number' ? 'any' : undefined}
        />
      </td>
    );
  }

  return (
    <td
      className={`editable-cell cursor-pointer ${className}`}
      onClick={() => setEditing(true)}
      title={title || '点击编辑'}
    >
      {value || <span className="text-gray-300">-</span>}
    </td>
  );
}
