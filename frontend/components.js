// frontend/components.js — Yeniden kullanılabilir React bileşenleri

// Loading Spinner
const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClass = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  }[size];
  
  return (
    <div className={`${sizeClass} border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin`}></div>
  );
};

// Card Component
const Card = ({ children, className = '', interactive = false }) => (
  <div className={`card ${interactive ? 'hover:shadow-lg' : ''} ${className}`}>
    {children}
  </div>
);

// Alert Component
const Alert = ({ type = 'info', message, onClose }) => {
  const colors = {
    info: 'bg-blue-50 border-blue-500 text-blue-900',
    success: 'bg-green-50 border-green-600 text-green-900',
    warning: 'bg-yellow-50 border-orange-500 text-yellow-900',
    error: 'bg-red-50 border-red-600 text-red-900'
  };
  
  return (
    <div className={`alert ${colors[type]}`} role="alert">
      <div className="flex justify-between items-start gap-3">
        <p className="flex-1">{message}</p>
        {onClose && (
          <button 
            onClick={onClose} 
            className="text-lg font-bold opacity-50 hover:opacity-100"
            aria-label="Kapat"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

// Modal Component
const Modal = ({ title, children, onClose, size = 'md' }) => {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl'
  };
  
  return (
    <div className="modal" onClick={onClose}>
      <div 
        className={`modal-content ${sizes[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="section-title">{title}</h2>
          <button 
            onClick={onClose}
            className="text-2xl font-bold text-gray-400 hover:text-gray-600"
            aria-label="Kapat"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// Form Input Group
const InputGroup = ({ label, name, type = 'text', value, onChange, error, required = false, placeholder }) => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-semibold text-gray-700 mb-2">
      {label} {required && <span className="text-red-600">*</span>}
    </label>
    <input
      id={name}
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        error ? 'border-red-600 bg-red-50' : 'border-gray-300'
      }`}
      required={required}
      aria-invalid={!!error}
      aria-describedby={error ? `${name}-error` : undefined}
    />
    {error && <p id={`${name}-error`} className="text-red-600 text-sm mt-1">{error}</p>}
  </div>
);

// Badge Component
const Badge = ({ label, variant = 'info', size = 'md' }) => {
  const variants = {
    info: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-700',
    pending: 'bg-orange-100 text-orange-700'
  };
  
  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2'
  };
  
  return (
    <span className={`badge ${variants[variant]} ${sizes[size]} rounded-full font-semibold`}>
      {label}
    </span>
  );
};

// Stats Card
const StatsCard = ({ icon, label, value, trend, color = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    orange: 'bg-orange-50 border-orange-200 text-orange-900',
    red: 'bg-red-50 border-red-200 text-red-900'
  };
  
  return (
    <div className={`card ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-2">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
          {trend && (
            <p className={`text-xs mt-2 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% bu ayda
            </p>
          )}
        </div>
        <div className="text-4xl opacity-20">{icon}</div>
      </div>
    </div>
  );
};

// Pagination Component
const Pagination = ({ page, totalPages, onPageChange }) => (
  <div className="flex justify-center items-center gap-2 mt-6">
    <button 
      onClick={() => onPageChange(page - 1)}
      disabled={page === 1}
      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
    >
      ← Önceki
    </button>
    <span className="px-4 py-2">Sayfa {page} / {totalPages}</span>
    <button 
      onClick={() => onPageChange(page + 1)}
      disabled={page === totalPages}
      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
    >
      Sonraki →
    </button>
  </div>
);

// Search Bar
const SearchBar = ({ value, onChange, placeholder = 'Ara...', onSearch }) => (
  <div className="flex gap-2">
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      onKeyPress={(e) => e.key === 'Enter' && onSearch && onSearch()}
    />
    {onSearch && (
      <button 
        onClick={onSearch}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700"
      >
        🔍
      </button>
    )}
  </div>
);

// Tabs Component
const Tabs = ({ tabs, active, onChange }) => (
  <div className="flex gap-2 border-b border-gray-300 mb-4">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-4 py-2 font-semibold border-b-2 transition ${
          active === tab.id
            ? 'border-blue-500 text-blue-700'
            : 'border-transparent text-gray-600 hover:text-gray-900'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

// Empty State
const EmptyState = ({ icon, title, description, action }) => (
  <div className="text-center py-12">
    <div className="text-6xl mb-4">{icon}</div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-600 mb-6">{description}</p>
    {action && action}
  </div>
);
