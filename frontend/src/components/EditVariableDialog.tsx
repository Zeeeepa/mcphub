import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Eye, EyeOff } from 'lucide-react';
import { apiPut } from '@/utils/fetchInterceptor';
import { useToast } from '@/contexts/ToastContext';

interface Variable {
  key: string;
  value: string;
}

interface EditVariableDialogProps {
  variable: Variable;
  onSave: () => void;
  onClose: () => void;
}

const EditVariableDialog: React.FC<EditVariableDialogProps> = ({ variable, onSave, onClose }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [value, setValue] = useState(variable.value);
  const [showValue, setShowValue] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!value.trim()) {
      setError('Variable value is required');
      return;
    }

    // If value hasn't changed, just close
    if (value.trim() === variable.value) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiPut(`/variables/${encodeURIComponent(variable.key)}`, {
        value: value.trim(),
      });

      if (response.success) {
        onSave();
      } else {
        setError(response.message || 'Failed to update variable');
      }
    } catch (err) {
      console.error('Error updating variable:', err);
      setError('Failed to update variable');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Edit Variable</h3>
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
              value={variable.key}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 font-mono text-gray-500"
              disabled
              readOnly
            />
            <p className="mt-1 text-xs text-gray-500">
              Variable key cannot be changed
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
                autoFocus
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
              disabled={isSubmitting || !value.trim() || value.trim() === variable.value}
            >
              {isSubmitting ? 'Updating...' : 'Update Variable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditVariableDialog;
