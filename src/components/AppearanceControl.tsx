import { useId, useState } from 'react';
import { Button, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { BrightnessAutoOutlined, LightModeOutlined, DarkModeOutlined, Check, ExpandMore } from '@mui/icons-material';

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
        id={buttonId}
        variant="outlined"
        size="small"
        color="inherit"
        className="lg-surface lg-pill lg-interactive"
        startIcon={selected.icon}
        endIcon={<ExpandMore fontSize="small" />}
        aria-label={`Appearance: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? menuId : undefined}
        onClick={event => setAnchor(event.currentTarget)}
        sx={{
          color: 'text.primary',
          bgcolor: 'var(--lg-fill-regular)',
          backgroundImage: 'var(--lg-surface-sheen)',
          boxShadow: 'var(--lg-shadow-pill)',
          borderColor: 'var(--lg-outer-hairline)',
          borderRadius: 999,
          minHeight: 40,
          '@media (pointer: coarse)': { minHeight: 44 },
          px: { xs: 1.15, sm: 1.6 },
          '& .MuiButton-startIcon': { mr: { xs: 0.5, sm: 0.75 } },
          '& .MuiButton-endIcon': { ml: { xs: 0.25, sm: 0.5 } },
          '&:hover': {
            bgcolor: 'var(--lg-fill-panel)',
            boxShadow: 'var(--lg-shadow-pill)',
            borderColor: 'var(--lg-outer-hairline)',
          },
        }}
      >
        {selected.label}
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{
          list: { 'aria-labelledby': buttonId },
          paper: { className: 'lg-surface lg-panel', sx: { mt: 0.75, borderRadius: '18px' } },
        }}
      >
        {choices.map(choice => {
          const isSelected = choice.value === selected.value;
          return (
            <MenuItem
              key={choice.value}
              role="menuitemradio"
              aria-checked={isSelected}
              selected={isSelected}
              onClick={() => { setMode(choice.value); setAnchor(null); }}
              sx={{
                color: isSelected ? 'primary.main' : 'text.primary',
                fontWeight: isSelected ? 600 : 500,
              }}
            >
              <ListItemIcon sx={{ color: isSelected ? 'primary.main' : 'text.secondary' }}>{choice.icon}</ListItemIcon>
              <ListItemText>{choice.label}</ListItemText>
              {isSelected && <Check fontSize="small" sx={{ ml: 2, color: 'primary.main' }} />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
