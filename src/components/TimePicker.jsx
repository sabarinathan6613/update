// src/components/TimePicker.jsx
import { useMemo } from 'react';
import { useSimulator } from '../utils/SimulatorContext';
import { getPlantTimeZone } from '../utils/timeService';

export default function TimePicker({ value, onChange, label }) {
  const { currentPlantId } = useSimulator();

  // Internally, value is "HH:mm" (24-hour format)
  const [hours, minutes] = useMemo(() => {
    if (!value) return ['08', '00'];
    return value.split(':');
  }, [value]);

  const selectHour = hours ? String(Number(hours) % 12 === 0 ? 12 : Number(hours) % 12).padStart(2, '0') : '08';
  const selectMinute = minutes ? String(minutes).padStart(2, '0') : '00';
  const selectAmPm = hours && Number(hours) >= 12 ? 'PM' : 'AM';

  const tz = useMemo(() => {
    const zone = getPlantTimeZone(currentPlantId);
    if (zone === 'Asia/Kolkata') return 'Asia/Kolkata (GMT +5:30)';
    if (zone === 'Australia/Perth') return 'Australia/Perth (GMT +8:00)';
    if (zone === 'America/New_York') return 'America/New_York (GMT -5:00)';
    return `${zone} (GMT)`;
  }, [currentPlantId]);

  const nextRunText = useMemo(() => {
    if (!value) return '';
    const [hrs, mins] = value.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hrs, mins, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    
    const pad = n => String(n).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let displayHrs = hrs % 12;
    if (displayHrs === 0) displayHrs = 12;
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    
    return `${target.getDate()} ${months[target.getMonth()]} ${target.getFullYear()} ${pad(displayHrs)}:${pad(mins)} ${ampm}`;
  }, [value]);

  const handleTimeChange = (newHr12, newMin, newAmPm) => {
    let hr24 = Number(newAmPm === 'PM' ? (newHr12 === '12' ? 12 : Number(newHr12) + 12) : (newHr12 === '12' ? 0 : Number(newHr12)));
    const formattedHr = String(hr24).padStart(2, '0');
    const formattedMin = String(newMin).padStart(2, '0');
    onChange(`${formattedHr}:${formattedMin}`);
  };

  const hourOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minuteOptions = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: '240px' }}>
      {label && <label className="form-label" style={{ margin: 0 }}>{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '42px' }}>
        <select
          className="form-control"
          value={selectHour}
          onChange={e => handleTimeChange(e.target.value, selectMinute, selectAmPm)}
          style={{ height: '42px', flex: 1, minWidth: '60px', padding: '0 8px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
        >
          {hourOptions.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-muted)' }}>:</span>
        <select
          className="form-control"
          value={selectMinute}
          onChange={e => handleTimeChange(selectHour, e.target.value, selectAmPm)}
          style={{ height: '42px', flex: 1, minWidth: '60px', padding: '0 8px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
        >
          {minuteOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          className="form-control"
          value={selectAmPm}
          onChange={e => handleTimeChange(selectHour, selectMinute, e.target.value)}
          style={{ height: '42px', flex: 1, minWidth: '70px', padding: '0 8px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      
      {/* Timezone Indicator */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <div>Timezone: <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>{tz}</span></div>
        <div style={{ marginTop: '2px' }}>
          Next Scheduled Run: <span style={{ color: 'var(--success)', fontWeight: 600 }}>{nextRunText}</span>
        </div>
      </div>
    </div>
  );
}
