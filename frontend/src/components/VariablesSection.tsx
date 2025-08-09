import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedVariable } from '../types';
import { 
  getUserVariables, 
  saveUserVariables, 
  deleteUserVariable,
  variablesToArray,
  variablesToObject 
} from '../services/variablesService';
import PermissionChecker from './PermissionChecker';
import { PERMISSIONS } from '../constants/permissions';

interface VariablesSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

const VariablesSection: React.FC<VariablesSectionProps> = ({ isOpen, onToggle }) => {
  const { t } = useTranslation();
  const [variables, setVariables] = useState<SavedVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newVariable, setNewVariable] = useState({ key: '', value: '' });

  // Load variables on component mount
  useEffect(() => {
    if (isOpen) {
      loadVariables();
    }
  }, [isOpen]);

  const loadVariables = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getUserVariables();
      if (response.success && response.data) {
        setVariables(variablesToArray(response.data));
      } else {
        setError(response.message || 'Failed to load variables');
      }
    } catch (err) {
      setError('Failed to load variables');
      console.error('Error loading variables:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVariables = async () => {
    setSaving(true);
    setError(null);
    try {
      const variablesObject = variablesToObject(variables);
      const response = await saveUserVariables(variablesObject);
      if (response.success) {
        // Reload to get the saved state
        await loadVariables();
      } else {
        setError(response.message || 'Failed to save variables');
      }
    } catch (err) {
      setError('Failed to save variables');
      console.error('Error saving variables:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVariable = async (key: string) => {
    if (!confirm(t('variables.confirmDelete', { key }))) {
      return;
    }

    try {
      const response = await deleteUserVariable(key);
      if (response.success) {
        setVariables(variables.filter(v => v.key !== key));
      } else {
        setError(response.message || 'Failed to delete variable');
      }
    } catch (err) {
      setError('Failed to delete variable');
      console.error('Error deleting variable:', err);
    }
  };

  const handleAddVariable = () => {
    if (!newVariable.key.trim()) {
      setError('Key is required');
      return;
    }

    // Check if key already exists
    if (variables.some(v => v.key === newVariable.key.trim())) {
      setError('Variable with this key already exists');
      return;
    }

    setVariables([...variables, { 
      key: newVariable.key.trim(), 
      value: newVariable.value 
    }]);
    setNewVariable({ key: '', value: '' });
    setShowAddDialog(false);
    setError(null);
  };

  const handleVariableChange = (index: number, field: 'key' | 'value', value: string) => {
    const updatedVariables = [...variables];
    updatedVariables[index][field] = value;
    setVariables(updatedVariables);
  };

  return (
    <PermissionChecker permissions={PERMISSIONS.SETTINGS_VARIABLES}>
      <div className="border border-gray-200 rounded-lg">
        <button
          onClick={onToggle}
          className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-t-lg flex items-center justify-between"
        >
          <span className="font-medium text-gray-900">
            {t('variables.title', 'Saved Variables')}
          </span>
          <svg
            className={`w-5 h-5 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="p-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-4">
              {t('variables.description', 'Store API keys and other variables that can be automatically substituted when adding servers. Variables are stored per user and take precedence over environment variables.')}
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-gray-600">{t('common.loading', 'Loading...')}</p>
              </div>
            ) : (
              <>
                {variables.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>{t('variables.noVariables', 'No variables saved yet')}</p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {variables.map((variable, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={variable.key}
                          onChange={(e) => handleVariableChange(index, 'key', e.target.value)}
                          placeholder={t('variables.keyPlaceholder', 'Key (e.g., GEMINI_API_KEY)')}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-500">=</span>
                        <input
                          type="password"
                          value={variable.value}
                          onChange={(e) => handleVariableChange(index, 'value', e.target.value)}
                          placeholder={t('variables.valuePlaceholder', 'Value')}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleDeleteVariable(variable.key)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                          title={t('variables.delete', 'Delete variable')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {t('variables.addVariable', 'Add Variable')}
                  </button>

                  {variables.length > 0 && (
                    <button
                      onClick={handleSaveVariables}
                      disabled={saving}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Add Variable Dialog */}
            {showAddDialog && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                  <h3 className="text-lg font-medium mb-4">
                    {t('variables.addVariable', 'Add Variable')}
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('variables.key', 'Key')}
                      </label>
                      <input
                        type="text"
                        value={newVariable.key}
                        onChange={(e) => setNewVariable({ ...newVariable, key: e.target.value })}
                        placeholder={t('variables.keyPlaceholder', 'e.g., GEMINI_API_KEY')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('variables.value', 'Value')}
                      </label>
                      <input
                        type="password"
                        value={newVariable.value}
                        onChange={(e) => setNewVariable({ ...newVariable, value: e.target.value })}
                        placeholder={t('variables.valuePlaceholder', 'Enter the value')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={handleAddVariable}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {t('common.ok', 'OK')}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddDialog(false);
                        setNewVariable({ key: '', value: '' });
                        setError(null);
                      }}
                      className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PermissionChecker>
  );
};

export default VariablesSection;
