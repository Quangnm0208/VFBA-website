import { Heading, Stack, Text } from '@sanity/ui';
import { useEffect, useState, type ReactNode } from 'react';
import type { Api, Me } from './api';
import { errorText } from './labels';
import { Alert, BetaNote, Loading, Page } from './ui';

type State = { state: 'loading' } | { state: 'ok'; me: Me } | { state: 'refused'; code: string; status: number };

/**
 * Opens the portal session before any tool shows data: the server verifies the Sanity token, binds a first sign-in to the staff
 * allowlist and answers who the person is. Every later call is verified again; this is only the front door.
 */
export function Gate({ api, children, title }: { api: Api; title: string; children: (me: Me) => ReactNode }) {
  const [state, setState] = useState<State>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    void api.call<{ me: Me }>('session').then((result) => {
      if (!live) return;
      setState(result.ok ? { state: 'ok', me: result.data.me } : { state: 'refused', code: result.code, status: result.status });
    });
    return () => {
      live = false;
    };
  }, [api]);

  if (state.state === 'ok') return <>{children(state.me)}</>;
  return (
    <Page>
      <BetaNote />
      <Heading as="h1" size={3}>
        VBFA · Cổng quản trị
      </Heading>
      {state.state === 'loading' ? (
        <Loading label="Đang kiểm tra tài khoản…" />
      ) : (
        <Stack gap={4}>
          <Alert>{errorText(state.code, state.status)}</Alert>
          <Text size={1} muted>
            Bạn vẫn có thể dùng mục “Quản trị nội dung” nếu tài khoản Sanity của bạn có quyền biên tập. {title}
          </Text>
        </Stack>
      )}
    </Page>
  );
}
