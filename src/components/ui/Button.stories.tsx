import type { Meta, StoryObj } from '@storybook/nextjs';
import { ArrowRight, Plus } from 'lucide-react';
import Button from './Button';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'danger', 'ghost'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    isLoading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: { children: '최적 경로 계산', variant: 'primary', size: 'md' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = { args: { variant: 'secondary', children: '취소' } };

export const Danger: Story = { args: { variant: 'danger', children: '삭제' } };

export const Ghost: Story = { args: { variant: 'ghost', children: '더 보기' } };

export const Loading: Story = { args: { isLoading: true, children: '계산 중' } };

export const WithIcons: Story = {
  args: { leftIcon: <Plus className="h-4 w-4" />, rightIcon: <ArrowRight className="h-4 w-4" />, children: '경유지 추가' },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">작게</Button>
      <Button {...args} size="md">보통</Button>
      <Button {...args} size="lg">크게</Button>
    </div>
  ),
};
