# gps-connector
_A FIWARE-based stack focusing on GPS device IoT data producers._

This project was spawned from OS2FleetOptimiser and is being developed collaboratively across public-sector organisations in Denmark to simplify and scale GPS data ingestion for fleet optimisation and smart-city use cases.

This repository is a sandbox/experimentation project.

### Background & Motivation
OS2FleetOptimiser relies on GPS data to produce aggregated trips and fleet insights. 
The original motivation for this project is scaling to make it easier and cheaper for organisations to get started with OS2FleetOptimiser by providing a simpler, more standardized setup for collecting data directly from GPS devices.
A secondary motivation is to establish a foundation for a Smart City connector component that is:
- interoperable across vendors and solutions
- reusable in other OS2/municipal contexts
- aligned with common open standards and FIWARE patterns


### Project participants
This sandbox project is developed and explored together with:
- OS2FleetOptimiser user group (15 public organisations in Denmark)
    - @sobuos
- Droids Agency 
    - @andreasDroid
- OS2 Secretariat 
    -@janhalen
- Teknik og Miljø Forvaltningen, City of Copenhagen 
    - @Lyneborg
    - @baffioso
    - @jschristensen
    - @A013kkpuma
    - @adamal

### Scope
This is an early-stage sandbox project intended to explore and validate:
•	ingestion of GPS device data from IoT producers,
•	broker/agent patterns proposed by OS2,
•	a minimal FIWARE stack that can be adopted incrementally.
**Not yet a production-ready connector!** 

### Architecture
The stack follows the OS2 proposal ("*Architectural proposal*")[https://janhalen.github.io/enterprise-architecture-patterns/proposals/2025-09-25-gps-agent-and-standard-broker.html]. 

In short, the proposal aims to enable direct device support by combining open-source components and standardized data flows, making GPS integrations simpler to replicate and scale. 
 
### Relationship to OS2FleetOptimiser
OS2FleetOptimiser is an open-source fleet optimisation solution in Denmark, now anchored in OS2 and used across multiple authorities. 
This project aims to reduce onboarding complexity for new adopters by offering a smaller, more repeatable device-to-broker GPS ingestion approach.
Relevant links:
- (OS2FleetOptimiser GitHub org)[https://github.com/OS2fleetoptimiser]
- (OS2 community)([https://www.os2.eu/]

#### Contributing
Contributions, experiments, and feedback are welcome!
Suggested ways to contribute:
- try the stack on real GPS devices/vendors,
- validate mapping to common data models,
- propose improvements to deployment simplicity,
- align with FIWARE and OS2 architecture patterns.
If you want to contribute, please open an issue or draft a PR.

#### License
This project is licensed under *AGPL-3.0*.
See LICENSE for details.

#### Contact
For questions or collaboration, reach out to the product secretary on os2fleetoptimiser@os2.eu. 
