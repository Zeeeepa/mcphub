import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface GitHubInstallFormProps {
  onInstall: (githubUrl: string, serverName?: string) => Promise<void>;
  onClose: () => void;
  isInstalling?: boolean;
}

interface Prerequisites {
  git: boolean;
  node: boolean;
  python: boolean;
  canInstall: boolean;
}

const GitHubInstallForm: React.FC<GitHubInstallFormProps> = ({
  onInstall,
  onClose,
  isInstalling = false,
}) => {
  const { t } = useTranslation();
  const [githubUrl, setGithubUrl] = useState('');
  const [serverName, setServerName] = useState('');
  const [isValidUrl, setIsValidUrl] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [prerequisites, setPrerequisites] = useState<Prerequisites | null>(null);
  const [isCheckingPrereqs, setIsCheckingPrereqs] = useState(true);

  // Check prerequisites on component mount
  useEffect(() => {
    const checkPrerequisites = async () => {
      try {
        const response = await fetch('/api/install/prerequisites');
        const data = await response.json();
        
        if (data.success) {
          setPrerequisites(data.data);
        }
      } catch (error) {
        console.error('Failed to check prerequisites:', error);
      } finally {
        setIsCheckingPrereqs(false);
      }
    };

    checkPrerequisites();
  }, []);

  // Validate GitHub URL
  useEffect(() => {
    const validateUrl = async () => {
      if (!githubUrl.trim()) {
        setIsValidUrl(false);
        setUrlError('');
        return;
      }

      try {
        const response = await fetch('/api/install/validate-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: githubUrl }),
        });

        const data = await response.json();
        
        if (data.success && data.data.valid) {
          setIsValidUrl(true);
          setUrlError('');
          
          // Auto-generate server name if not provided
          if (!serverName && data.data.owner && data.data.repo) {
            setServerName(`${data.data.owner}-${data.data.repo}`);
          }
        } else {
          setIsValidUrl(false);
          setUrlError(data.data.message || 'Invalid GitHub URL');
        }
      } catch (error) {
        setIsValidUrl(false);
        setUrlError('Failed to validate URL');
      }
    };

    const timeoutId = setTimeout(validateUrl, 500);
    return () => clearTimeout(timeoutId);
  }, [githubUrl, serverName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidUrl || !prerequisites?.canInstall) {
      return;
    }

    await onInstall(githubUrl, serverName || undefined);
  };

  const renderPrerequisiteStatus = () => {
    if (isCheckingPrereqs) {
      return (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center">
            <svg className="animate-spin h-4 w-4 text-blue-500 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-blue-700">Checking system requirements...</span>
          </div>
        </div>
      );
    }

    if (!prerequisites) {
      return (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-red-700">Failed to check system requirements</p>
        </div>
      );
    }

    return (
      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
        <h4 className="font-medium text-gray-900 mb-2">System Requirements:</h4>
        <div className="space-y-1 text-sm">
          <div className="flex items-center">
            {prerequisites.git ? (
              <svg className="h-4 w-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            <span className={prerequisites.git ? 'text-green-700' : 'text-red-700'}>
              Git {prerequisites.git ? 'Available' : 'Not Available'}
            </span>
          </div>
          <div className="flex items-center">
            {prerequisites.node ? (
              <svg className="h-4 w-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            <span className={prerequisites.node ? 'text-green-700' : 'text-red-700'}>
              Node.js {prerequisites.node ? 'Available' : 'Not Available'}
            </span>
          </div>
          <div className="flex items-center">
            {prerequisites.python ? (
              <svg className="h-4 w-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            <span className={prerequisites.python ? 'text-green-700' : 'text-red-700'}>
              Python {prerequisites.python ? 'Available' : 'Not Available'}
            </span>
          </div>
        </div>
        
        {!prerequisites.canInstall && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-red-700 text-sm">
              Installation requires Git and at least one runtime (Node.js or Python).
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Install from GitHub
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isInstalling}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {renderPrerequisiteStatus()}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="githubUrl" className="block text-sm font-medium text-gray-700 mb-1">
              GitHub Repository URL *
            </label>
            <input
              type="url"
              id="githubUrl"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                urlError ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={isInstalling}
              required
            />
            {urlError && (
              <p className="mt-1 text-sm text-red-600">{urlError}</p>
            )}
            {isValidUrl && (
              <p className="mt-1 text-sm text-green-600">✓ Valid GitHub URL</p>
            )}
          </div>

          <div>
            <label htmlFor="serverName" className="block text-sm font-medium text-gray-700 mb-1">
              Server Name (optional)
            </label>
            <input
              type="text"
              id="serverName"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Auto-generated from repository name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isInstalling}
            />
            <p className="mt-1 text-sm text-gray-500">
              If not provided, will be auto-generated from the repository name
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              disabled={isInstalling}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValidUrl || !prerequisites?.canInstall || isInstalling}
              className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                isValidUrl && prerequisites?.canInstall && !isInstalling
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isInstalling ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Installing...
                </>
              ) : (
                'Install'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GitHubInstallForm;
