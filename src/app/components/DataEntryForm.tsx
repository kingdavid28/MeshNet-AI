import { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { getSQLiteService } from "../../services/sqliteService";

type FormType = 'contact' | 'facility' | 'shelter';

export function DataEntryForm() {
  const [formType, setFormType] = useState<FormType>('contact');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Emergency Contact Form
  const [contact, setContact] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    category: 'medical',
    location: '',
    medicalSpecialty: ''
  });

  // Medical Facility Form
  const [facility, setFacility] = useState({
    id: '',
    name: '',
    lat: '',
    lng: '',
    type: 'hospital',
    phone: '',
    address: ''
  });

  // Shelter Form
  const [shelter, setShelter] = useState({
    id: '',
    name: '',
    lat: '',
    lng: '',
    capacity: '',
    currentOccupancy: '',
    phone: '',
    address: ''
  });

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleSubmit = async () => {
    setSuccess(false);
    setError('');
    
    const sqliteService = getSQLiteService();
    
    try {
      if (formType === 'contact') {
        if (!contact.name || !contact.phone || !contact.category) {
          setError('Name, phone, and category are required');
          return;
        }
        
        const success = await sqliteService.addEmergencyContact({
          id: contact.id || generateId(),
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          category: contact.category,
          location: contact.location,
          medicalSpecialty: contact.medicalSpecialty
        });
        
        if (success) {
          setSuccess(true);
          setContact({ id: '', name: '', phone: '', email: '', category: 'medical', location: '', medicalSpecialty: '' });
          setTimeout(() => setSuccess(false), 3000);
        } else {
          setError('Failed to add contact');
        }
      } else if (formType === 'facility') {
        if (!facility.name || !facility.lat || !facility.lng) {
          setError('Name, latitude, and longitude are required');
          return;
        }
        
        const success = await sqliteService.addMedicalFacility({
          id: facility.id || generateId(),
          name: facility.name,
          lat: parseFloat(facility.lat),
          lng: parseFloat(facility.lng),
          type: facility.type,
          phone: facility.phone,
          address: facility.address
        });
        
        if (success) {
          setSuccess(true);
          setFacility({ id: '', name: '', lat: '', lng: '', type: 'hospital', phone: '', address: '' });
          setTimeout(() => setSuccess(false), 3000);
        } else {
          setError('Failed to add facility');
        }
      } else if (formType === 'shelter') {
        if (!shelter.name || !shelter.lat || !shelter.lng) {
          setError('Name, latitude, and longitude are required');
          return;
        }
        
        const success = await sqliteService.addShelter({
          id: shelter.id || generateId(),
          name: shelter.name,
          lat: parseFloat(shelter.lat),
          lng: parseFloat(shelter.lng),
          capacity: parseInt(shelter.capacity) || 0,
          currentOccupancy: parseInt(shelter.currentOccupancy) || 0,
          phone: shelter.phone,
          address: shelter.address
        });
        
        if (success) {
          setSuccess(true);
          setShelter({ id: '', name: '', lat: '', lng: '', capacity: '', currentOccupancy: '', phone: '', address: '' });
          setTimeout(() => setSuccess(false), 3000);
        } else {
          setError('Failed to add shelter');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Form Type Selector */}
      <div className="flex gap-2">
        {(['contact', 'facility', 'shelter'] as FormType[]).map((type) => (
          <button
            key={type}
            onClick={() => {
              setFormType(type);
              setSuccess(false);
              setError('');
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              formType === type
                ? 'bg-[#5B8DD9] text-white'
                : 'bg-[#132B5A] text-[#7B9CC4] border border-[rgba(91,141,217,0.2)]'
            }`}
          >
            {type === 'contact' ? 'Emergency Contact' : type === 'facility' ? 'Medical Facility' : 'Shelter'}
          </button>
        ))}
      </div>

      {/* Success Message */}
      {success && (
        <div className="flex items-center gap-2 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg p-3">
          <Check size={16} className="text-[#22C55E]" />
          <span className="text-sm text-[#22C55E]">Data added successfully</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3">
          <X size={16} className="text-[#EF4444]" />
          <span className="text-sm text-[#EF4444]">{error}</span>
        </div>
      )}

      {/* Emergency Contact Form */}
      {formType === 'contact' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Name *</label>
            <input
              type="text"
              value={contact.name}
              onChange={(e) => setContact({ ...contact, name: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="Dr. John Smith"
            />
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Phone *</label>
            <input
              type="tel"
              value={contact.phone}
              onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="+1234567890"
            />
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Email</label>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="john@hospital.com"
            />
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Category *</label>
            <select
              value={contact.category}
              onChange={(e) => setContact({ ...contact, category: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
            >
              <option value="medical">Medical</option>
              <option value="fire">Fire Department</option>
              <option value="police">Police</option>
              <option value="rescue">Rescue</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Location</label>
            <input
              type="text"
              value={contact.location}
              onChange={(e) => setContact({ ...contact, location: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="City Hospital"
            />
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Medical Specialty</label>
            <input
              type="text"
              value={contact.medicalSpecialty}
              onChange={(e) => setContact({ ...contact, medicalSpecialty: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="Emergency Medicine"
            />
          </div>
        </div>
      )}

      {/* Medical Facility Form */}
      {formType === 'facility' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Name *</label>
            <input
              type="text"
              value={facility.name}
              onChange={(e) => setFacility({ ...facility, name: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="City General Hospital"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#7B9CC4] mb-1 block">Latitude *</label>
              <input
                type="number"
                step="any"
                value={facility.lat}
                onChange={(e) => setFacility({ ...facility, lat: e.target.value })}
                className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
                placeholder="40.7128"
              />
            </div>
            <div>
              <label className="text-xs text-[#7B9CC4] mb-1 block">Longitude *</label>
              <input
                type="number"
                step="any"
                value={facility.lng}
                onChange={(e) => setFacility({ ...facility, lng: e.target.value })}
                className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
                placeholder="-74.0060"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Type</label>
            <select
              value={facility.type}
              onChange={(e) => setFacility({ ...facility, type: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
            >
              <option value="hospital">Hospital</option>
              <option value="clinic">Clinic</option>
              <option value="urgent_care">Urgent Care</option>
              <option value="pharmacy">Pharmacy</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Phone</label>
            <input
              type="tel"
              value={facility.phone}
              onChange={(e) => setFacility({ ...facility, phone: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="+1234567890"
            />
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Address</label>
            <input
              type="text"
              value={facility.address}
              onChange={(e) => setFacility({ ...facility, address: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="123 Main St"
            />
          </div>
        </div>
      )}

      {/* Shelter Form */}
      {formType === 'shelter' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Name *</label>
            <input
              type="text"
              value={shelter.name}
              onChange={(e) => setShelter({ ...shelter, name: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="Emergency Shelter A"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#7B9CC4] mb-1 block">Latitude *</label>
              <input
                type="number"
                step="any"
                value={shelter.lat}
                onChange={(e) => setShelter({ ...shelter, lat: e.target.value })}
                className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
                placeholder="40.7148"
              />
            </div>
            <div>
              <label className="text-xs text-[#7B9CC4] mb-1 block">Longitude *</label>
              <input
                type="number"
                step="any"
                value={shelter.lng}
                onChange={(e) => setShelter({ ...shelter, lng: e.target.value })}
                className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
                placeholder="-74.0080"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#7B9CC4] mb-1 block">Capacity</label>
              <input
                type="number"
                value={shelter.capacity}
                onChange={(e) => setShelter({ ...shelter, capacity: e.target.value })}
                className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
                placeholder="100"
              />
            </div>
            <div>
              <label className="text-xs text-[#7B9CC4] mb-1 block">Current Occupancy</label>
              <input
                type="number"
                value={shelter.currentOccupancy}
                onChange={(e) => setShelter({ ...shelter, currentOccupancy: e.target.value })}
                className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
                placeholder="45"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Phone</label>
            <input
              type="tel"
              value={shelter.phone}
              onChange={(e) => setShelter({ ...shelter, phone: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="+1234567892"
            />
          </div>
          <div>
            <label className="text-xs text-[#7B9CC4] mb-1 block">Address</label>
            <input
              type="text"
              value={shelter.address}
              onChange={(e) => setShelter({ ...shelter, address: e.target.value })}
              className="w-full bg-[#0B1D3A] border border-[rgba(91,141,217,0.2)] rounded-lg px-3 py-2 text-sm text-[#E8EEF7] outline-none focus:border-[#5B8DD9]"
              placeholder="789 Pine Rd"
            />
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        className="w-full bg-[#5B8DD9] hover:bg-[#4A7BC8] text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        <Plus size={18} />
        Add to Database
      </button>
    </div>
  );
}
