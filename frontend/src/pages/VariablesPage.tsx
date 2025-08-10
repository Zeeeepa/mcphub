import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost, apiDelete } from '../utils/fetchInterceptor';

interface SavedVariable {
  key: string;
  value: string;
  description?: string;
  encrypted?: boolean;
  createdAt: string;
  updatedAt: string;
}

const VariablesPage: React.FC = () => {
  const { t } = useTranslation();
  const [variables, setVariables] = useState<SavedVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingVariable, setEditingVariable] = useState<SavedVariable | null>(null);
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
    encrypt: false,
  });

  useEffect(() => {
    loadVariables();
  }, []);

  const loadVariables = async () => {
    try {
      setLoading(true);
      const response = await apiGet('/variables');
      if (response.success) {
        setVariables(response.data || []);
      } else {
        setError('Failed to load variables');
      }
    } catch (err) {
      setError('Failed to load variables');
      console.error('Error loading variables:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVariable = () => {
    setFormData({ key: '', value: '', description: '', encrypt: false });
    setEditingVariable(null);
    setShowAddDialog(true);
  };

  const handleEditVariable = (variable: SavedVariable) => {
    setFormData({
      key: variable.key,
      value: variable.encrypted ? '' : variable.value, // Don't show encrypted values in edit form
      description: variable.description || '',
      encrypt: variable.encrypted || false,
    });
    setEditingVariable(variable);
    setShowAddDialog(true);
  };

  const handleSaveVariable = async () => {
    try {
      if (!formData.key.trim() || !formData.value.trim()) {
        setError('Key and value are required');
        return;
      }

      // Validate key format
      if (!/^[A-Z_][A-Z0-9_]*$/.test(formData.key)) {
        setError('Key must contain only uppercase letters, numbers, and underscores, and start with a letter or underscore');
        return;
      }

      const payload = {
        key: formData.key.trim(),
        value: formData.value.trim(),
        description: formData.description.trim() || undefined,
        encrypt: formData.encrypt,
      };

      const response = await apiPost('/variables', payload);
      
      if (response.success) {
        setShowAddDialog(false);
        setFormData({ key: '', value: '', description: '', encrypt: false });
        setEditingVariable(null);
        setError(null);
        await loadVariables();
      } else {
        setError(response.message || 'Failed to save variable');
      }
    } catch (err) {
      setError('Failed to save variable');
      console.error('Error saving variable:', err);
    }
  };

  const handleDeleteVariable = async (key: string) => {
    if (!confirm(`Are you sure you want to delete the variable "${key}"?`)) {
      return;
    }

    try {
      const response = await apiDelete(`/variables/${encodeURIComponent(key)}`);
      
      if (response.success) {
        await loadVariables();
      } else {
        setError(response.message || 'Failed to delete variable');
      }
    } catch (err) {
      setError('Failed to delete variable');
      console.error('Error deleting variable:', err);
    }
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setFormData({ key: '', value: '', description: '', encrypt: false });
    setEditingVariable(null);
    setError(null);
  };

  const handleExportVariables = async () => {
    try {
      const response = await apiGet('/variables/export');
      if (response.success) {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mcphub-variables-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        setError(response.message || 'Failed to export variables');
      }
    } catch (err) {
      setError('Failed to export variables');
      console.error('Error exporting variables:', err);
    }
  };

  const handleImportVariables = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if (!importData.variables || !Array.isArray(importData.variables)) {
        setError('Invalid file format. Expected variables array.');
        return;
      }

      const overwrite = window.confirm('Do you want to overwrite existing variables with the same keys?');
      
      const response = await apiPost('/variables/import', {
        variables: importData.variables,
        overwrite
      });

      if (response.success) {
        await loadVariables();
        setError(null);
        // Show success message
        alert(response.message || 'Variables imported successfully');
      } else {
        setError(response.message || 'Failed to import variables');
      }
    } catch (err) {
      setError('Failed to import variables. Please check the file format.');
      console.error('Error importing variables:', err);
    }
    
    // Reset file input
    event.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Saved Variables</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportVariables}
            className="px-4 py-2 bg-green-100 text-green-800 rounded hover:bg-green-200 flex items-center transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Export
          </button>
          <label className="px-4 py-2 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 flex items-center cursor-pointer transition-all duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 11-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Import
            <input
              type="file"
              accept=".json"
              onChange={handleImportVariables}
              className="hidden"
            />
          </label>
          <button
            onClick={handleAddVariable}
            className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center btn-primary transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Variable
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {variables.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a4 4 0 004-4V5z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No variables</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first variable.</p>
          <div className="mt-6">
            <button
              onClick={handleAddVariable}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Variable
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {variables.map((variable) => (
              <li key={variable.key}>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {variable.key}
                      </p>
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Variable
                      </span>
                      {variable.encrypted && (
                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                          Encrypted
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <p className="text-sm text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded">
                        {variable.encrypted 
                          ? '••••••••••••••••••••••••••••••••••••••••••••••••••' 
                          : (variable.value.length > 50 ? `${variable.value.substring(0, 50)}...` : variable.value)
                        }
                      </p>
                    </div>
                    {variable.description && (
                      <p className="mt-1 text-sm text-gray-500">
                        {variable.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      Created: {new Date(variable.createdAt).toLocaleDateString()}
                      {variable.updatedAt !== variable.createdAt && (
                        <span className="ml-2">
                          Updated: {new Date(variable.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditVariable(variable)}
                      className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteVariable(variable.key)}
                      className="text-red-600 hover:text-red-900 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add/Edit Variable Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingVariable ? 'Edit Variable' : 'Add Variable'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Key *
                  </label>
                  <input
                    type="text"
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value.toUpperCase() })}
                    placeholder="GEMINI_API_KEY"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!!editingVariable} // Don't allow editing key for existing variables
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Use uppercase letters, numbers, and underscores only
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value *
                  </label>
                  <input
                    type="text"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="your-actual-api-key"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="encrypt"
                    checked={formData.encrypt}
                    onChange={(e) => setFormData({ ...formData, encrypt: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="encrypt" className="ml-2 block text-sm text-gray-900">
                    Encrypt this variable (recommended for API keys, tokens, passwords)
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={handleCloseDialog}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVariable}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  {editingVariable ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariablesPage;
