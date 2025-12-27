Define a Shared State: Use a TypedDict with a messages key using the add_messages reducer.
Create the Router Node: Prompt the LLM to act as a "Data Coordinator." Instruct it to output tool calls if more information is needed or a simple "FINISH" message if it has enough data.
Use Parallel Tool Execution: Use the prebuilt ToolNode. When the LLM emits multiple tool calls in one turn, ToolNode executes them in parallel and returns all results to the Router in a single step.
Implement the Handoff Logic: Create a conditional edge using a should_continue function. If the last message contains tool_calls, route to tools. If not, route to the synthesis node.
Create the Synthesis Node: This node receives the full history (User query + all Tool results) and generates the final creative response.
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_core.messages import SystemMessage

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

# 1. Router: Only for tool selection
def router_node(state: AgentState):
    system_prompt = SystemMessage(content=(
        "You are a Data Coordinator. Your only job is to gather data. "
        "If you need information, call the relevant tools. "
        "If you have all the information needed to answer the user, "
        "simply reply with: 'DATA_GATHERED'."
    ))
    # Note: Binding tools to the model here
    llm_with_tools = model.bind_tools(tools)
    return {"messages": [llm_with_tools.invoke([system_prompt] + state["messages"])]}

# 2. Logic: The "Traffic Controller"
def should_continue(state: AgentState) -> Literal["tools", "synthesis"]:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return "synthesis"

# 3. Synthesis: Only for the final answer
def synthesis_node(state: AgentState):
    system_prompt = SystemMessage(content=(
        "You are a Creative Assistant. Use the tool results in the conversation "
        "history to provide a polished, helpful response to the user."
    ))
    return {"messages": [model.invoke([system_prompt] + state["messages"])]}

# 4. Build the Graph
builder = StateGraph(AgentState)
builder.add_node("router", router_node)
builder.add_node("tools", ToolNode(tools))
builder.add_node("synthesis", synthesis_node)

builder.add_edge(START, "router")
builder.add_conditional_edges("router", should_continue)
builder.add_edge("tools", "router")  # Returns to router for verification
builder.add_edge("synthesis", END)

graph = builder.compile()
Copy
How This Optimizes LLM Calls
Parallelism: If the Router needs 3 different things, it calls 3 tools at once. You get 3 results back, but only pay for one LLM call to review them all.
Handoff: The moment the Router sees it has enough data (no more tool calls), it transitions to the Synthesis node. There is no "intermediate" conversational LLM call.
Single Turn Verification: The "Router LLM call (with results)" happens exactly once after each tool execution block to decide if the mission is accomplished or if a new sequential step is required.
Relevant docs:

[Multi-agent Patterns: Router](https://docs.langchain.com/oss/python/langchain/multi-agent/router)
[Multi-agent Patterns: Handoffs](https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs)
[LangGraph Quickstart](https://docs.langchain.com/oss/python/langgraph/overview)
[Prebuilt ToolNode Reference](https://docs.langchain.com/oss/python/langgraph/graph-api#toolnode)