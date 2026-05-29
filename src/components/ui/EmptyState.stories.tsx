import type { Meta, StoryObj } from '@storybook/nextjs';
import { Inbox } from 'lucide-react';
import EmptyState from './EmptyState';
import Button from './Button';

const meta = {
  title: 'UI/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  args: {
    title: '최근 저장된 경로가 없어요',
    description: '경로를 최적화한 뒤 저장하면 여기에서 다시 불러올 수 있어요.',
    size: 'md',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { icon: <Inbox className="h-6 w-6" /> },
};

export const WithAction: Story = {
  args: {
    icon: <Inbox className="h-6 w-6" />,
    action: <Button size="sm" variant="secondary">새 경로 만들기</Button>,
  },
};
