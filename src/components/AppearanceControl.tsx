import { useId, useState } from 'react';
import { Button, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { BrightnessAutoOutlined, LightModeOutlined, DarkModeOutlined, Check } from '@mui/icons-material';

const choices = [
  { value: 'system', label: 'System', icon: <BrightnessAutoOutlined fontSize="small" /> },
  { value: 'light', label: 'Light', icon: <LightModeOutlined fontSize="small" /> },
  { value: 'dark', label: 'Dark', icon: <DarkModeOutlined fontSize="small" /> },
] as const;

export default function AppearanceControl() {
  const buttonId = useId();
  const menuId = useId();
  const { mode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const selected = choices.find(choice => choice.value === mode) ?? choices[0];
  return (
    <>
      <Button
        id={buttonId} color="inherit" startIcon={selected.icon}
        aria-label={`Appearance: ${selected.label}`} aria-haspopup="menu"
        aria-expanded={Boolean(anchor)} aria-controls={anchor ? menuId : undefined}
        onClick={event => setAnchor(event.currentTarget)}
      >
        {selected.label}
      </Button>
      <Menu id={menuId} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ list: { 'aria-labelledby': buttonId } }}>
        {choices.map(choice => (
          <MenuItem key={choice.value} role="menuitemradio" aria-checked={choice.value === selected.value} onClick={() => { setMode(choice.value); setAnchor(null); }}>
            <ListItemIcon>{choice.icon}</ListItemIcon>
            <ListItemText>{choice.label}</ListItemText>
            {choice.value === selected.value && <Check fontSize="small" sx={{ ml: 2 }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
