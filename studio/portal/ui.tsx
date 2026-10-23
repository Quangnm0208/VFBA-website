import { Card, Flex, Spinner, Stack, Text } from '@sanity/ui';
import type { ReactNode } from 'react';
import styled from 'styled-components';

export const Page = ({ children }: { children: ReactNode }) => (
  <Card padding={[3, 4, 5]} sizing="border" style={{ minHeight: '100%' }}>
    <Stack gap={5} style={{ maxWidth: 1200, margin: '0 auto' }}>
      {children}
    </Stack>
  </Card>
);

/** Beta notice shown on every portal screen: synthetic data only until the privacy documents are approved. */
export const BetaNote = () => (
  <Card padding={3} radius={2} tone="caution" border>
    <Text size={1}>Bản thử nghiệm (Beta): chỉ dùng dữ liệu thử cho đến khi chính sách bảo mật và nội dung đồng ý được duyệt.</Text>
  </Card>
);

export const Alert = ({ children }: { children: ReactNode }) => (
  <Card padding={3} radius={2} tone="critical" border role="alert">
    <Text size={1}>{children}</Text>
  </Card>
);

export const Notice = ({ children }: { children: ReactNode }) => (
  <Card padding={3} radius={2} tone="positive" border role="status">
    <Text size={1}>{children}</Text>
  </Card>
);

export const Loading = ({ label }: { label: string }) => (
  <Flex align="center" gap={3} padding={4} role="status" aria-live="polite">
    <Spinner />
    <Text size={1} muted>
      {label}
    </Text>
  </Flex>
);

export const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <Stack gap={2}>
    <Text as="label" htmlFor={id} size={1} weight="medium">
      {label}
    </Text>
    {children}
  </Stack>
);

/** Plain table, scrolls sideways inside its own box on narrow screens (the page itself never scrolls sideways). */
export const TableBox = styled.div`
  position: relative; /* contains the visually hidden header text, so it cannot widen the page */
  overflow-x: auto;
  border: 1px solid var(--card-border-color);
  border-radius: 3px;
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    min-width: 640px;
  }
  caption {
    text-align: left;
    padding: 12px;
    font-weight: 600;
  }
  th,
  td {
    text-align: left;
    padding: 10px 12px;
    border-top: 1px solid var(--card-border-color);
    vertical-align: top;
  }
  th {
    font-weight: 600;
    white-space: nowrap;
  }
`;

/** Text that keeps the line breaks a person typed (notes). */
export const Pre = styled.p`
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;
