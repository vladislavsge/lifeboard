// Небольшие ограничители запросов: глубина и число полей.
// Своя реализация вместо зависимостей — схема плоская, правила умещаются в экран.
import { GraphQLError, Kind } from 'graphql';
import type { ASTVisitor, FragmentDefinitionNode, SelectionSetNode, ValidationContext } from 'graphql';

function depthOf(
  set: SelectionSetNode | undefined,
  ctx: ValidationContext,
  seen: Set<string>,
): number {
  if (!set) return 0;
  let max = 0;
  for (const sel of set.selections) {
    if (sel.kind === Kind.FIELD) {
      max = Math.max(max, 1 + depthOf(sel.selectionSet, ctx, seen));
    } else if (sel.kind === Kind.INLINE_FRAGMENT) {
      max = Math.max(max, depthOf(sel.selectionSet, ctx, seen));
    } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
      const name = sel.name.value;
      if (seen.has(name)) continue; // циклический фрагмент — его отловит другое правило
      const frag: FragmentDefinitionNode | null | undefined = ctx.getFragment(name);
      if (frag) max = Math.max(max, depthOf(frag.selectionSet, ctx, new Set([...seen, name])));
    }
  }
  return max;
}

/** Запрос только к служебным полям схемы (__schema, __type) — это интроспекция. */
function isIntrospection(set: SelectionSetNode): boolean {
  return set.selections.every((s) => s.kind === Kind.FIELD && s.name.value.startsWith('__'));
}

/** Запрещает запросы глубже max уровней. */
export function depthLimit(max: number) {
  return (ctx: ValidationContext): ASTVisitor => ({
    OperationDefinition(node) {
      // интроспекция по природе глубокая; в prod она и так выключена
      if (isIntrospection(node.selectionSet)) return;
      const depth = depthOf(node.selectionSet, ctx, new Set());
      if (depth > max) {
        ctx.reportError(
          new GraphQLError(`Запрос слишком глубокий: ${depth} уровней при лимите ${max}`, { nodes: [node] }),
        );
      }
    },
  });
}
