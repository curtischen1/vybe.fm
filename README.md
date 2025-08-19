# Vybe 🎵

> AI-powered music discovery that matches songs to your specific moment using context + reference tracks.

## What is Vybe?

Vybe revolutionizes music discovery by understanding your context and personal taste. Instead of generic "people like you" recommendations, Vybe focuses on YOUR individual preferences and current situation.

### How It Works

1. **Describe Your Vybe**: "Driving with friends, want upbeat music"
2. **Add Reference Songs**: 1-3 tracks that match your current mood
3. **Get Personalized Recommendations**: 10-20 contextually relevant songs
4. **Train Your Algorithm**: Upvote/downvote to improve future recommendations

## Core Philosophy

- **Your taste, not the crowd's** - No collaborative filtering
- **Context matters** - Same song, different situations = different recommendations  
- **Individual-first** - Pure personal taste learning
- **Anti-mainstream** - No label payola or popularity bias

## Technical Architecture

### Backend
- **Node.js + TypeScript** for rapid development
- **PostgreSQL** for user data and interactions
- **Redis** for caching and performance
- **Spotify Web API** for music data and audio features
- **OpenAI API** for natural language context interpretation

### Frontend  
- **React Native** for cross-platform mobile app
- **TypeScript** for type safety
- **Redux Toolkit** for state management

### AI-Powered Recommendation Engine
- **Semantic Audio Analysis** using Spotify's audio features
- **Context Weighting** via AI interpretation
- **Personal Pattern Learning** from user feedback
- **Anti-Collaborative Filtering** approach

## Project Status

🚧 **Currently in Development** - MVP Phase (Weeks 1-12)

- [x] Product Requirements Document
- [x] Development Plan & Architecture  
- [x] CodeRabbit Integration Setup
- [ ] Backend Foundation (Week 1-4)
- [ ] Recommendation Engine (Week 5-8)
- [ ] Mobile App Development (Week 9-12)

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Spotify Developer Account
- OpenAI API Key

### Setup Instructions
*Coming soon - backend setup in Week 1*

## Documentation

- [📋 Product Requirements Document](./docs/Vybe_PRD.md)
- [🗓️ Development Plan](./docs/Vybe_MVP_Development_Plan.md)
- [🏗️ Architecture Guide](./docs/architecture.md) *(coming soon)*
- [🔌 API Documentation](./docs/api.md) *(coming soon)*

## Contributing

This project uses [CodeRabbit](https://coderabbit.ai) for AI-powered code reviews. All pull requests are automatically reviewed for:

- Security vulnerabilities
- Performance optimizations  
- Code quality and maintainability
- Testing coverage
- Documentation completeness

### Development Workflow

1. Create feature branch from `main`
2. Implement changes following our [Development Plan](./docs/Vybe_MVP_Development_Plan.md)
3. Push and create Pull Request
4. CodeRabbit automatically reviews your code
5. Address feedback and iterate
6. Merge when approved

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React Native + TypeScript | Cross-platform mobile app |
| **Backend** | Node.js + Express + TypeScript | API server and business logic |
| **Database** | PostgreSQL + Redis | Data persistence and caching |
| **AI/ML** | OpenAI API + Custom algorithms | Context interpretation and recommendations |
| **Music Data** | Spotify Web API | Track metadata and audio features |
| **Hosting** | Vercel + Railway | Deployment and infrastructure |

## Roadmap

### Phase 1: MVP (Months 1-3)
- ✅ Core backend architecture
- ✅ Spotify integration  
- ✅ AI context processing
- ✅ Basic recommendation engine
- ✅ Mobile app with essential features

### Phase 2: Growth (Months 4-6)  
- 🔄 Advanced personalization
- 🔄 Social features
- 🔄 Premium subscription model
- 🔄 Android release

### Phase 3: Scale (Months 7-12)
- 🔄 B2B API licensing
- 🔄 Multi-platform support
- 🔄 Advanced analytics
- 🔄 Lyrical semantic analysis

## License

*License to be determined*

---

**Built with ❤️ for music lovers who want truly personal discovery**
# Deployment Status

🚀 **Live Application**: [Vybe Music Discovery](https://vybe-fm.vercel.app)

## Quick Start
1. Visit the live app above
2. Connect your Spotify account
3. Describe your musical vybe context
4. Get personalized recommendations!

# Deployment Notes
- Auto-deploys from main branch via Vercel
- Last updated: Aug 19, 2025
