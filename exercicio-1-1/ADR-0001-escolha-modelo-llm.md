# ADR-0001: Escolha do Modelo de LLM

## Status: Proposto

## Contexto

A NovaTech necessita de um LLM para alimentar um assistente de IA baseado em RAG para sua equipe de atendimento. As restrições que moldam esta decisão são:

- **Volume projetado:** 320 chamados/dia × 60% com consulta documental = **~192 queries/dia** com recuperação de contexto
- **Estimativa de tokens por query** (sistema + chunks RAG + histórico + resposta): ~6.000–9.000 tokens/query → **~55M–86M tokens/mês**
- **Requisito crítico de confiabilidade:** o assistente nunca deve inventar informações — toda resposta deve ser fundamentada nos chunks recuperados
- **Requisito de rastreabilidade:** respostas devem citar a fonte do documento
- **Ecossistema existente:** Microsoft 365 E3 + Azure AI Services disponíveis; dados residem no Azure
- **Janela de contexto necessária:** chunks de documentação (~500 tokens cada) + histórico de conversa + prompt de sistema exigem no mínimo 16k tokens; PDFs com tabelas complexas podem gerar chunks maiores

As opções avaliadas foram: (A) Azure OpenAI — GPT-4o, (B) Claude 3.5 Sonnet via Anthropic API, (C) modelos open-source auto-hospedados via Ollama (Llama 3, Mistral).

## Decisão

**Adotar Azure OpenAI com GPT-4o** como modelo primário do pipeline RAG.

Justificativa quantitativa de custo:

| Item | Estimativa |
|---|---|
| Tokens de entrada/mês | ~70M tokens |
| Tokens de saída/mês | ~8M tokens |
| Custo entrada (GPT-4o: $2,50/1M) | ~$175/mês |
| Custo saída (GPT-4o: $10/1M) | ~$80/mês |
| **Total estimado** | **~$255/mês** |

Este valor é compatível com o orçamento de um projeto de 3 meses e escala de forma previsível com o volume.

Fatores decisivos adicionais:

1. **Janela de contexto de 128k tokens** — elimina risco de truncamento mesmo em queries multi-domínio com múltiplos chunks e histórico de sessão
2. **Residência de dados no Azure** — os documentos da NovaTech (incluindo possíveis dados de clientes) não saem do tenant Azure, atendendo a requisitos de compliance e LGPD
3. **Integração nativa** com Azure AI Search, Azure Bot Service e Microsoft Teams — stack já decidido para o projeto
4. **Fine-tuning e system prompts avançados** — o controle de não-alucinação não dependerá apenas de system prompt. Será implementado com guardrails de groundedness, validação de citação por chunk e política de abstinência quando não houver evidência suficiente.
5. **SLA gerenciado pela Microsoft** — sem overhead operacional de GPU, atualizações de modelo ou escalabilidade

## Consequências

**Positivas:**
- Menor complexidade operacional: nenhuma infraestrutura de GPU para gerenciar
- Contratos e SLAs já integrados ao Azure da NovaTech
- Atualizações de modelo transparentes via Azure (sem re-deploy)
- GPT-4o demonstra comportamento de grounding robusto quando instruído via system prompt + prompt engineering de RAG

**Negativas:**
- Dependência de vendor (Microsoft/OpenAI) — mudanças de preço ou política afetam o projeto
- Custo variável: picos de uso (ex.: período de fechamento de mês, incidentes logísticos) podem elevar o custo sem aviso
- GPT-4o não é o modelo mais barato para queries simples — GPT-4o mini poderia ser considerado para queries de baixa complexidade
- Latência de rede para o endpoint Azure OpenAI pode ser fator em regiões sem data center próximo

## Alternativas Consideradas

**Claude 3.5 Sonnet (Anthropic API):**
- Qualidade de resposta comparável ou superior em benchmarks de seguimento de instruções
- Descartado porque requer chamada de API externa ao ecossistema Azure, criando risco de compliance com dados de clientes e aumentando a superfície de integração
- Custo similar ao GPT-4o sem os benefícios de integração nativa

**Modelos open-source via Ollama (Llama 3.1 70B, Mistral):**
- Custo marginal zero por token após infraestrutura
- Descartado pelo custo de infraestrutura GPU (mínimo 2× A100 para throughput adequado = $3k–5k/mês em Azure), pela maior taxa de alucinação em tarefas de grounding documental sem fine-tuning, e pelo overhead operacional incompatível com o prazo de 3 meses
- Pode ser reconsiderado em versão futura se volume crescer 10× tornando custo por token dominante

## Critérios de Aceite para Produção (Go/No-Go)

A entrada em produção dependerá do atendimento dos seguintes SLOs por 2 semanas consecutivas em ambiente piloto:

- Groundedness (resposta suportada por evidência recuperada): >= 98%
- Citação válida de fonte (documento + seção/chunk + versão): >= 99%
- Taxa de abstinência correta ("evidência insuficiente"): >= 95%
- Latência fim-a-fim p95: <= 4s; p99 <= 7s
- Atualização de conteúdo no índice após publicação oficial: <= 24h em 99% dos casos

## Política de Contradição entre Fontes

Quando houver divergência entre documentos recuperados, o assistente deve:

1. Aplicar precedência por (a) política oficial, (b) documento mais recente, (c) fonte proprietária sobre fonte derivada.
2. Explicitar o conflito na resposta e citar ambas as fontes.
3. Na ausência de regra de precedência, retornar resposta de incerteza e encaminhar para validação humana.

## Custos e Limites Operacionais (TCO)

Além de tokens do LLM, o TCO incluirá Azure AI Search, embeddings, armazenamento, observabilidade, retries e ambientes de teste.
Serão mantidos dois cenários: Base e Pico, com gatilhos automáticos:

- Alerta amarelo: 70% do orçamento mensal
- Alerta vermelho: 90% do orçamento mensal
- Ação de contenção: redução de top-k, compressão de contexto e roteamento para modelo de menor custo em consultas simples

## Risco de Lock-in e Estratégia de Portabilidade

Embora Azure OpenAI seja a escolha primária, o desenho do pipeline será vendor-agnostic no nível de orquestração:
- Interface de provedor de modelo desacoplada
- Prompts e avaliações versionados externamente
- Teste trimestral de portabilidade para provedor alternativo