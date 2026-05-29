import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Switch from './Switch';

const meta = {
  title: 'UI/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: { size: 'md', checked: true, onCheckedChange: () => {}, 'aria-label': '실시간 교통정보' },
  render: (args) => {
    const [checked, setChecked] = useState(true);
    return <Switch {...args} checked={checked} onCheckedChange={setChecked} />;
  },
};

export const Disabled: Story = {
  args: { size: 'md', disabled: true, checked: false, onCheckedChange: () => {}, 'aria-label': '비활성 스위치' },
};
