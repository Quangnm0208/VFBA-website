import { Button, Card, Flex, Grid, Heading, Stack, Text } from '@sanity/ui';
import { useEffect, useState } from 'react';
import type { Api, Me } from './api';
import { errorText, kindLabel, roleLabel } from './labels';
import { Alert, BetaNote, Loading, Page } from './ui';

/** Where the cards lead. A prop so the screen can be tested without a Studio router. */
export interface Navigate {
  (path: '/content' | '/leads' | '/staff'): void;
}

export function OverviewApp({ api, me, go }: { api: Api; me: Me; go: Navigate }) {
  const [counts, setCounts] = useState<{ fresh: number; working: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([api.call<{ total: number }>('leads.list', { status: 'new' }), api.call<{ total: number }>('leads.list', { status: 'contacted' })]).then(([a, b]) => {
      if (!live) return;
      if (a.ok && b.ok) setCounts({ fresh: a.data.total, working: b.data.total });
      else setError(errorText(!a.ok ? a.code : !b.ok ? b.code : 'error', !a.ok ? a.status : !b.ok ? b.status : 0));
    });
    return () => {
      live = false;
    };
  }, [api]);

  return (
    <Page>
      <BetaNote />
      <Stack gap={2}>
        <Heading as="h1" size={3}>
          VBFA · Cổng quản trị
        </Heading>
        <Text size={1} muted>
          Một nơi cho nội dung website và khách đăng ký. Đăng nhập: {me.email} · {roleLabel(me.role)}
        </Text>
      </Stack>
      {error ? <Alert>{error}</Alert> : null}
      <Grid gridTemplateColumns={[1, 1, me.role === 'admin' ? 3 : 2]} gap={4}>
        <Card padding={4} radius={2} border as="section" aria-labelledby="ov-content">
          <Stack gap={3}>
            <Heading as="h2" size={1} id="ov-content">
              Quản trị nội dung
            </Heading>
            <Text size={1} muted>
              Trang chủ, tin tức, trang nội dung, SEO, pop-up và thông tin chung. Bấm Publish để website tự cập nhật.
            </Text>
            <Flex>
              <Button text="Mở quản trị nội dung" onClick={() => go('/content')} />
            </Flex>
          </Stack>
        </Card>
        <Card padding={4} radius={2} border as="section" aria-labelledby="ov-leads">
          <Stack gap={3}>
            <Heading as="h2" size={1} id="ov-leads">
              Quản lý Lead
            </Heading>
            {counts ? (
              <Text size={1}>
                <strong>{counts.fresh}</strong> khách mới · <strong>{counts.working}</strong> đang xử lý
              </Text>
            ) : error ? null : (
              <Loading label="Đang đếm…" />
            )}
            <Text size={1} muted>
              Phạm vi của bạn: {me.kinds.map(kindLabel).join(', ')}.
            </Text>
            <Flex>
              <Button text="Mở danh sách Lead" onClick={() => go('/leads')} />
            </Flex>
          </Stack>
        </Card>
        {me.role === 'admin' ? (
          <Card padding={4} radius={2} border as="section" aria-labelledby="ov-staff">
            <Stack gap={3}>
              <Heading as="h2" size={1} id="ov-staff">
                Quản trị nhân sự
              </Heading>
              <Text size={1} muted>
                Ai được xem và xử lý Lead, với vai trò và phạm vi nào.
              </Text>
              <Flex>
                <Button text="Mở quản trị nhân sự" onClick={() => go('/staff')} />
              </Flex>
            </Stack>
          </Card>
        ) : null}
      </Grid>
    </Page>
  );
}
