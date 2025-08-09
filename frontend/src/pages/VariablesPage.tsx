import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import AddVariableDialog from '@/components/AddVariableDialog';
import EditVariableDialog from '@/components/EditVariableDialog';
import DeleteDialog from '@/components/ui/DeleteDialog';
import { apiGet, apiDelete } from '@/utils/fetchInterceptor';
import { useToast } from '@/contexts/ToastContext';

interface Variable {
  key: string;
  value: string;
}

const VariablesPage: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [deletingVariable, setDeletingVariable] = useState<Variable | null>(null);
  const [visibleValues, setVisibleValues] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadVariables();
  }, []);

  const loadVariables = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiGet('/variables');
      
      if (response.success) {
        // Convert object to array for easier rendering
        const variableArray = Object.entries(response.data || {}).map(([key, value]) => ({
          key,
          value: value as string,
        }));
        setVariables(variableArray);
      } else {
        setError(response.message || 'Failed to load variables');
      }
    } catch (err) {
      console.error('Error loading variables:', err);
      setError('Failed to load variables');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddVariable = () => {
    setShowAddDialog(false);
    loadVariables();
    showToast('Variable added successfully', 'success');
  };

  const handleEditVariable = (variable: Variable) => {
    setEditingVariable(variable);
  };

  const handleEditComplete = () => {
    setEditingVariable(null);
    loadVariables();
    showToast('Variable updated successfully', 'success');
  };

  const handleDeleteVariable = (variable: Variable) => {
    setDeletingVariable(variable);
  };

  const handleConfirmDelete = async () => {
    if (!deletingVariable) return;

    try {
      const response = await apiDelete(`/variables/${encodeURIComponent(deletingVariable.key)}`);
      
      if (response.success) {
        setDeletingVariable(null);
        loadVariables();
        showToast('Variable deleted successfully', 'success');
      } else {
        showToast(response.message || 'Failed to delete variable', 'error');
      }
    } catch (err) {
      console.error('Error deleting variable:', err);
      showToast('Failed to delete variable', 'error');
    }
  };

  const toggleValueVisibility = (key: string) => {
    const newVisibleValues = new Set(visibleValues);
    if (newVisibleValues.has(key)) {
      newVisibleValues.delete(key);
    } else {
      newVisibleValues.add(key);
    }
    setVisibleValues(newVisibleValues);
  };

  const maskValue = (value: string): string => {
    if (value.length <= 4) return '••••';
    return value.substring(0, 2) + '••••' + value.substring(value.length - 2);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Saved Variables</h1>
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center btn-primary transition-all duration-200"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Variable
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm error-box">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-4 text-gray-500 hover:text-gray-700 transition-colors duration-200 btn-secondary"
              aria-label="Close error"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 011.414 0L10 8.586l4.293-4.293a1 1 111.414 1.414L11.414 10l4.293 4.293a1 1 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 01-1.414-1.414L8.586 10 4.293 5.707a1 1 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white shadow rounded-lg p-6 flex items-center justify-center loading-container">
          <div className="flex flex-col items-center">
            <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600">Loading variables...</p>
          </div>
        </div>
      ) : variables.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-6 empty-state">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No variables saved</h3>
            <p className="text-gray-600 mb-4">
              Save environment variables like API keys to automatically substitute them in server configurations.
            </p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center mx-auto btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Variable
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              {variables.length} Variable{variables.length !== 1 ? 's' : ''}
            </h3>
          </div>
          <div className="divide-y divide-gray-200">
            {variables.map((variable) => (
              <div key={variable.key} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {variable.key}
                      </h4>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Environment Variable
                      </span>
                    </div>
                    <div className="mt-2 flex items-center space-x-2">
                      <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded font-mono">
                        {visibleValues.has(variable.key) ? variable.value : maskValue(variable.value)}
                      </code>
                      <button
                        onClick={() => toggleValueVisibility(variable.key)}
                        className="text-gray-400 hover:text-gray-600 transition-colors btn-secondary"
                        title={visibleValues.has(variable.key) ? 'Hide value' : 'Show value'}
                      >
                        {visibleValues.has(variable.key) ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditVariable(variable)}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors btn-secondary"
                      title="Edit variable"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteVariable(variable)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors btn-secondary"
                      title="Delete variable"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddDialog && (
        <AddVariableDialog
          onSave={handleAddVariable}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {editingVariable && (
        <EditVariableDialog
          variable={editingVariable}
          onSave={handleEditComplete}
          onClose={() => setEditingVariable(null)}
        />
      )}

      {deletingVariable && (
        <DeleteDialog
          isOpen={true}
          onClose={() => setDeletingVariable(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Variable"
          message={`Are you sure you want to delete the variable "${deletingVariable.key}"? This action cannot be undone.`}
        />
      )}
    </div>
  );
};

export default VariablesPage;
