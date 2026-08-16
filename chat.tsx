import { useChat } from "@/hooks/use-chat";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatArea } from "@/components/chat-area";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useGetModelInfo } from "@workspace/api-client-react";

export default function ChatPage() {
  const chat = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: modelInfo } = useGetModelInfo();

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-72 flex-col border-r border-border/50 bg-black">
        <ChatSidebar 
          conversations={chat.conversations}
          activeConversationId={chat.activeConversationId}
          onSelect={chat.setActiveConversationId}
          onNewChat={chat.startNewChat}
          onDelete={chat.handleDeleteConversation}
        />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 border-r-0">
          <ChatSidebar 
            conversations={chat.conversations}
            activeConversationId={chat.activeConversationId}
            onSelect={(id) => {
              chat.setActiveConversationId(id);
              setSidebarOpen(false);
            }}
            onNewChat={() => {
              chat.startNewChat();
              setSidebarOpen(false);
            }}
            onDelete={chat.handleDeleteConversation}
          />
        </SheetContent>
      </Sheet>

      {/* Main Chat Area */}
      <div
        className="flex-1 flex flex-col min-w-0 relative"
        style={{
          backgroundImage: "url('/chat-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border/50 bg-background/80 backdrop-blur-sm absolute top-0 w-full z-10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground">
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex flex-col">
              <span className="font-mono text-sm tracking-wider font-semibold">MAVERICK.SYS</span>
              {modelInfo?.model && (
                <span className="font-mono text-[9px] tracking-wider text-muted-foreground opacity-60">{modelInfo.model}</span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={chat.startNewChat} className="font-mono text-xs">
            NEW_
          </Button>
        </header>

        <ChatArea 
          messages={chat.messages}
          onSendMessage={chat.sendMessage}
          isStreaming={chat.isStreaming}
          streamedContent={chat.streamedContent}
          onStopStreaming={chat.stopStreaming}
          activeConversation={chat.activeConversation}
        />
      </div>
    </div>
  );
}