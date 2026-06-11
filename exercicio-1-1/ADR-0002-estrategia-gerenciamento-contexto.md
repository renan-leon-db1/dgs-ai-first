# ADR-0002: Estratégia de Gerenciamento de Contexto

## Status: Proposto

## Contexto

Em um pipeline RAG, o LLM não acessa toda a base de documentos — ele recebe um "orçamento de atenção" por query composto por: (1) prompt de sistema, (2) chunks recuperados via busca vetorial, (3) histórico de conversa da sessão, e (4) a pergunta do usuário. A forma como esse orçamento é alocado determina diretamente a qualidade das respostas e o custo do sistema.

Forças em tensão nesta decisão:

- **Janela de contexto do GPT-4o:** 128k tokens — grande, mas não ilimitada e cada token custa dinheiro
- **Chunking definido:** seção por overlap de 10%, estimativa de ~500 tokens/chunk
- **Perguntas multi-domínio:** um atendente pode perguntar "qual o prazo para entrega expressa para cliente Diamante com devolução em curso?" — cruzando SLA, tipo de cliente, regras de frete e política de devolução simultaneamente
- **Context rot em sessões Teams:** a mesma janela de chat pode conter 10–15 perguntas ao longo de um turno de 6 horas; o histórico acumulado eventualmente degrada a qualidade das respostas porque o modelo "dilui" atenção entre contexto relevante e histórico obsoleto
- **Documentos atualizados mensalmente:** chunks obsoletos no contexto geram respostas desatualizadas

## Decisão

Adotar uma **estratégia de contexto estruturado com orçamento explícito e janela deslizante para histórico**, conforme detalhado abaixo:

### Orçamento de tokens por query

| Componente | Tokens Reservados |
|---|---|
| Prompt de sistema (persona, regras, instruções anti-alucinação) | 1.500 |
| Chunks RAG recuperados | 4.000 (8 chunks × ~500 tokens) |
| Histórico de conversa (janela deslizante) | 2.000 |
| Query do usuário | 300 |
| Buffer para resposta do modelo | 1.200 |
| **Total por turn** | **~9.000 tokens** |

Este orçamento representa ~7% da janela máxima do GPT-4o, mantendo custo controlado e headroom para casos excepcionais.

### Número de chunks recuperados

Recuperar **8 chunks por query como padrão**, com o seguinte critério:
- Top-8 por score de similaridade vetorial (cosine similarity > 0.75)
- Se score do 5º chunk cair abaixo de 0.60, truncar para os 4 mais relevantes (qualidade > quantidade)
- Re-ranqueamento via Azure AI Search Semantic Ranker antes de enviar ao LLM

### Estratégia para perguntas multi-domínio

Detectar intenção multi-domínio via classificação prévia da query (pode ser feito com um modelo leve ou heurística de palavras-chave). Quando detectado:

1. Executar **busca paralela por categoria** (SLA, frete, devolução, compliance) com 2–3 chunks cada
2. Montar contexto com chunks interleaved por categoria, com separador explícito no prompt: `[FONTE: SLA Clientes Diamante v2.3]`
3. Instruir o modelo no system prompt a responder cada dimensão separadamente antes de sintetizar

### Tratamento de context rot em sessões longas (Teams)

Implementar **janela deslizante com sumarização implícita**:
- Manter as **últimas 3 trocas completas** (pergunta + resposta) no contexto
- Trocas anteriores são descartadas — **não resumidas** (resumos introduzem o risco de o modelo "lembrar" de informações que não constam mais no contexto de documentos)
- A cada nova query, o pipeline de RAG recupera chunks frescos — a "memória" do sistema é a base vetorial, não o histórico de chat
- Incluir no system prompt: _"Cada pergunta é respondida com base nos documentos recuperados neste momento. Não assuma que informações de respostas anteriores ainda são válidas."_

## Consequências

**Positivas:**
- Custo previsível e controlado (~9k tokens/query vs. acumular histórico ilimitado)
- Context rot mitigado estruturalmente — o histórico não cresce indefinidamente
- Queries multi-domínio tratadas explicitamente em vez de depender do modelo "descobrir" a intenção
- Re-ranqueamento semântico melhora precisão sem aumentar o número de chunks

**Negativas:**
- Descarte de histórico após 3 trocas pode frustrar atendentes que fazem perguntas de follow-up referenciando respostas muito anteriores
- Classificação de intenção multi-domínio adiciona latência (~50–100ms) e pode falhar em queries ambíguas
- 8 chunks podem ser insuficientes para documentos com tabelas complexas onde a resposta está distribuída em múltiplas seções não contíguas

## Alternativas Consideradas

**Enviar histórico completo da sessão:**
- Simples de implementar
- Descartado porque após 10+ trocas o contexto acumulado dilui a atenção do modelo nos chunks relevantes, aumenta custo linearmente e piora a qualidade das respostas (context rot documentado empiricamente)

**Sumarização do histórico (compressão de contexto):**
- Reduz tokens do histórico mantendo "memória"
- Descartado porque introduz risco de o resumo distorcer informações factuais — inaceitável em contexto de atendimento onde precisão é crítica

**Aumentar para 16 chunks:**
- Melhor cobertura para queries complexas
- Descartado como padrão porque dobra o custo de tokens de contexto; mantido como fallback configurável para documentos de alta complexidade
