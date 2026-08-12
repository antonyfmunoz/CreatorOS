export function deleteAgentWithChats<
  TAgent,
  TChat extends { agentId: number },
>(
  agentId: number,
  agents: Map<number, TAgent>,
  chats: Map<number, TChat>,
): boolean {
  const deleted = agents.delete(agentId);
  if (!deleted) return false;
  for (const [chatId, chat] of Array.from(chats.entries())) {
    if (chat.agentId === agentId) chats.delete(chatId);
  }
  return true;
}
