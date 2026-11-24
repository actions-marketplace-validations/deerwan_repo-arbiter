import { describe, expect, it } from 'vitest';
import { GithubAdapter } from '../src/adapters/github.js';

type Octokit = ConstructorParameters<typeof GithubAdapter>[0];

/** Minimal octokit stand-in: only the label endpoints the adapter touches, with call counting. */
function makeOctokit(initialLabels: string[], options: { conflictOnCreate?: boolean } = {}) {
  const labels = [...initialLabels];
  const created: string[] = [];
  const attempted: string[] = [];
  let listCalls = 0;
  const rest = {
    issues: {
      listLabelsForRepo: async () => {
        listCalls += 1;
        return { data: labels.map((name) => ({ name })) };
      },
      createLabel: async (params: { name: string }) => {
        attempted.push(params.name);
        // Mirror GitHub: a label created by a concurrent run makes createLabel answer 422 already_exists.
        if (options.conflictOnCreate && labels.includes(params.name)) {
          throw Object.assign(new Error('Validation Failed: name already_exists'), { status: 422 });
        }
        created.push(params.name);
        labels.push(params.name);
        return { data: { name: params.name } };
      },
    },
  };
  const octokit = {
    rest,
    paginate: async <T>(fn: (params: unknown) => Promise<{ data: T }>, params: unknown): Promise<T> =>
      (await fn(params)).data,
  } as unknown as Octokit;
  return { octokit, created, attempted, listCalls: () => listCalls };
}

describe('GithubAdapter labels', () => {
  it('lists repository labels once per instance and reuses the cache', async () => {
    const fake = makeOctokit(['arbiter/bug', 'arbiter/feature']);
    const adapter = new GithubAdapter(fake.octokit, 'acme', 'widget');

    const first = await adapter.listLabels();
    const second = await adapter.listLabels();
    await adapter.ensureLabel('arbiter/bug', 'desc');

    expect(first).toEqual(['arbiter/bug', 'arbiter/feature']);
    expect(second).toEqual(first);
    expect(second).not.toBe(first); // callers cannot mutate the cache
    expect(fake.listCalls()).toBe(1);
    expect(fake.created).toEqual([]);
  });

  it('creates a missing label once and keeps the cache coherent', async () => {
    const fake = makeOctokit([]);
    const adapter = new GithubAdapter(fake.octokit, 'acme', 'widget', 42);

    await adapter.ensureLabel('arbiter/bug', 'desc');
    await adapter.ensureLabel('arbiter/bug', 'desc');
    const labels = await adapter.listLabels();

    expect(fake.created).toEqual(['arbiter/bug']);
    expect(labels).toEqual(['arbiter/bug']);
    expect(fake.listCalls()).toBe(1);
  });

  it('does not share the cache between adapter instances', async () => {
    const fake = makeOctokit([]);
    const reader = new GithubAdapter(fake.octokit, 'acme', 'widget');
    const writer = new GithubAdapter(fake.octokit, 'acme', 'widget', 42);

    await reader.listLabels();
    await writer.listLabels();

    expect(fake.listCalls()).toBe(2);
  });

  it('treats a 422 from a concurrent run that created the label first as success', async () => {
    const fake = makeOctokit([], { conflictOnCreate: true });
    const slowRun = new GithubAdapter(fake.octokit, 'acme', 'widget', 1);
    await slowRun.listLabels(); // caches an empty list before the LLM call

    // Another run on a different issue creates the same label meanwhile.
    await new GithubAdapter(fake.octokit, 'acme', 'widget', 2).ensureLabel('arbiter/bug', 'desc');

    await expect(slowRun.ensureLabel('arbiter/bug', 'desc')).resolves.toBeUndefined();
    expect(fake.attempted).toEqual(['arbiter/bug', 'arbiter/bug']);
    expect(fake.created).toEqual(['arbiter/bug']);
    expect(await slowRun.listLabels()).toContain('arbiter/bug');
    expect(fake.listCalls()).toBe(3); // slow run's first list, the other run's list, re-check after 422
  });

  it('rethrows a 422 when the label still does not exist afterwards', async () => {
    const rest = {
      issues: {
        listLabelsForRepo: async () => ({ data: [] }),
        createLabel: async () => {
          throw Object.assign(new Error('Validation Failed: color is invalid'), { status: 422 });
        },
      },
    };
    const octokit = {
      rest,
      paginate: async <T>(fn: (params: unknown) => Promise<{ data: T }>, params: unknown): Promise<T> =>
        (await fn(params)).data,
    } as unknown as Octokit;
    const adapter = new GithubAdapter(octokit, 'acme', 'widget', 1);

    await expect(adapter.ensureLabel('arbiter/bug', 'desc')).rejects.toMatchObject({ status: 422 });
  });
});
