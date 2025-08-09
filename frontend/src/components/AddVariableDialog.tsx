import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Eye, EyeOff } from 'lucide-react';
import { apiPost } from '@/utils/fetchInterceptor';
import { useToast } from '@/contexts/ToastContext';

interface AddVariableDialogProps {
  onSave: () => void;
  onClose: () => void;
}

const AddVariableDialog: React.FC<AddVariableDialogProps> = ({ onSave, onClose }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!key.trim()) {
      setError('Variable key is required');
      return;
    }

    if (!value.trim()) {
      setError('Variable value is required');
      return;
    }

    // Validate key format (should be uppercase with underscores)
    const keyPattern = /^[A-Z][A-Z0-9_]*$/;
    if (!keyPattern.test(key.trim())) {
      setError('Variable key should be uppercase letters, numbers, and underscores only (e.g., API_KEY, GEMINI_API_KEY)');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiPost('/variables', {
        key: key.trim(),
        value: value.trim(),
      });

      if (response.success) {
        onSave();
      } else {
        setError(response.message || 'Failed to create variable');
      }
    } catch (err) {
      console.error('Error creating variable:', err);
      setError('Failed to create variable');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    setKey(newKey);
    setError(null);
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Add Variable</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors btn-secondary"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="variable-key" className="block text-sm font-medium text-gray-700 mb-2">
              Key
            </label>
            <input
              id="variable-key"
              type="text"
              value={key}
              onChange={handleKeyChange}
              placeholder="e.g., GEMINI_API_KEY, OPENAI_API_KEY"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
              disabled={isSubmitting}
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500">
              Use uppercase letters, numbers, and underscores only
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor="variable-value" className="block text-sm font-medium text-gray-700 mb-2">
              Value
            </label>
            <div className="relative">
              <input
                id="variable-value"
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={handleValueChange}
                placeholder="Enter the variable value"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 btn-secondary"
                disabled={isSubmitting}
              >
                {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              This value will be substituted when the key matches in server configurations
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || !key.trim() || !value.trim()}
            >
              {isSubmitting ? 'Adding...' : 'Add Variable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddVariableDialog;
