import axios from "axios";
import { OpenVidu } from "openvidu-browser";
import React, { Component } from "react";
import OvComponent from "./OvComponent";
import Unity, { UnityContext } from "react-unity-webgl";
import "./WorldManager.css";

import { useNavigate } from "react-router-dom";

import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";

export const withNavigation = (Component) => {
  return (props) => <Component {...props} navigate={useNavigate()} />;
};

const unityContext = new UnityContext({
  loaderUrl: "unity/Build/Build.loader.js",
  dataUrl: "unity/Build/Build.data.unityweb",
  frameworkUrl: "unity/Build/Build.framework.js",
  codeUrl: "unity/Build/Build.wasm",
  // loaderUrl: "unity/Build/testWebGL.loader.js",
  // dataUrl: "unity/Build/testWebGL.data",
  // frameworkUrl: "unity/Build/testWebGL.framework.js",
  // codeUrl: "unity/Build/testWebGL.wasm",
});

const OPENVIDU_SERVER_URL = "https://k6d102.p.ssafy.io:9797";
const OPENVIDU_SERVER_SECRET = "ssafy";

var thisClass = null;

class WorldManager extends Component {
  constructor(props) {
    super(props);

    this.state = {
      mySessionId: "SessionA",
      myUserName: "Participant" + Math.floor(Math.random() * 100),
      session: undefined,
      mainStreamManager: undefined,
      publisher: undefined,
      subscribers: [],
      progression: 0,
      isLoaded: false,
      isOnMic: true,
      isOnSpeaker: true,
      intervalId: 0,
    };

    this.joinSession = this.joinSession.bind(this);
    this.onoffMic = this.onoffMic.bind(this);
    this.onoffSpeaker = this.onoffSpeaker.bind(this);
    this.leaveSession = this.leaveSession.bind(this);
    this.switchCamera = this.switchCamera.bind(this);
    this.handleChangeSessionId = this.handleChangeSessionId.bind(this);
    this.handleChangeUserName = this.handleChangeUserName.bind(this);
    this.handleMainVideoStream = this.handleMainVideoStream.bind(this);
    this.onbeforeunload = this.onbeforeunload.bind(this);
    this.setProgress = this.setProgress.bind(this);
    this.openUrl = this.openUrl.bind(this);
    this.getNicknameTag = this.getNicknameTag.bind(this);
    this.sendMicStatus = this.sendMicStatus.bind(this);

    thisClass = this;
  }

  componentDidMount() {
    window.addEventListener("beforeunload", this.onbeforeunload);

    unityContext.on("progress", function (progression) {
      thisClass.setProgress(progression);
    });

    unityContext.on("loaded", function () {
      thisClass.setState({
        isLoaded: true,
      });
    });

    unityContext.on("JoinSession", function (userName) {
      thisClass.joinSession(userName);
    });

    unityContext.on("OnOffMic", function () {
      thisClass.onoffMic();
    });

    unityContext.on("OnOffSpeaker", function () {
      thisClass.onoffSpeaker();
    });

    unityContext.on("LeaveSession", function () {
      thisClass.leaveSession();
    });

    unityContext.on("SelectHome", function () {
      thisClass.props.navigate("/");
    });

    unityContext.on("OpenUrl", function (url) {
      thisClass.openUrl(url);
    });

    // 1초 간격으로 mic status 전송
    const intervalId = setInterval(() => {
      this.sendMicStatus();
    }, 1000);

    this.setState({
      intervalId: intervalId,
    });
  }

  sendMicStatus() {
    if (this.state.session !== undefined) {
      let micStatusStr = "";

      // 현재 사용자 마이크 상태정보
      micStatusStr += this.getNicknameTag(this.state.publisher);
      micStatusStr += "*";
      if (this.state.publisher.stream.audioActive === true) {
        micStatusStr += "on";
      } else {
        micStatusStr += "off";
      }

      // 세션 참가자들의 마이크 상태정보
      this.state.subscribers.forEach((subscriber) => {
        micStatusStr += "|";
        micStatusStr += this.getNicknameTag(subscriber);
        micStatusStr += "*";
        if (subscriber.stream.audioActive == true) {
          micStatusStr += "on";
        } else {
          micStatusStr += "off";
        }
      });

      //console.log(micStatusStr);

      // 유니티로 마이크 상태정보 전송
      unityContext.send(
        "PlayerList",
        "UpdatePlayerListEditorWebgl",
        micStatusStr
      );
    }
  }

  getNicknameTag(streamManager) {
    return JSON.parse(streamManager.stream.connection.data).clientData;
  }

  openUrl(url) {
    window.open(
      url,
      "_blank",
      "resizable=yes, top=150, left=200, width=1600, height=800"
    );
  }

  setProgress(progression) {
    this.setState({
      progression: (progression * 100).toFixed(0),
    });
  }

  onoffMic() {
    let isOnMic = this.state.isOnMic;

    if (this.state.publisher !== undefined) {
      this.state.publisher.publishAudio(!isOnMic);
    }

    this.setState({
      isOnMic: !isOnMic,
    });
  }

  onoffSpeaker() {
    let isOnSpeaker = this.state.isOnSpeaker;

    let len = this.state.subscribers.length;
    for (let i = 0; i < len; i++) {
      // if (this.state.subscribers[i] !== undefined) {
      this.state.subscribers[i].subscribeToAudio(isOnSpeaker);
      //}
    }

    this.setState({
      isOnSpeaker: !isOnSpeaker,
    });

    // if (this.state.subscribers.length > 0) {
    //   let subscriber = this.state.subscribers[0];
    //   console.log(JSON.parse(subscriber.stream.connection.data).clientData);
    // }
  }

  componentWillUnmount() {
    window.removeEventListener("beforeunload", this.onbeforeunload);

    clearInterval(this.state.intervalId);
  }

  onbeforeunload(event) {
    this.leaveSession();
  }

  handleChangeSessionId(e) {
    this.setState({
      mySessionId: e.target.value,
    });
  }

  handleChangeUserName(e) {
    this.setState({
      myUserName: e.target.value,
    });
  }

  handleMainVideoStream(stream) {
    if (this.state.mainStreamManager !== stream) {
      this.setState({
        mainStreamManager: stream,
      });
    }
  }

  deleteSubscriber(streamManager) {
    let subscribers = this.state.subscribers;
    let index = subscribers.indexOf(streamManager, 0);
    if (index > -1) {
      subscribers.splice(index, 1);
      this.setState({
        subscribers: subscribers,
      });
    }
  }

  joinSession(userName) {
    // --- 1) Get an OpenVidu object ---

    this.OV = new OpenVidu();

    // --- 2) Init a session ---

    this.setState(
      {
        session: this.OV.initSession(),
      },
      () => {
        var mySession = this.state.session;

        // --- 3) Specify the actions when events take place in the session ---

        // On every new Stream received...
        mySession.on("streamCreated", (event) => {
          // Subscribe to the Stream to receive it. Second parameter is undefined
          // so OpenVidu doesn't create an HTML video by its own
          var subscriber = mySession.subscribe(event.stream, undefined);
          var subscribers = this.state.subscribers;
          subscribers.push(subscriber);

          // Update the state with the new subscribers
          this.setState({
            subscribers: subscribers,
          });
        });

        // On every Stream destroyed...
        mySession.on("streamDestroyed", (event) => {
          // Remove the stream from 'subscribers' array
          this.deleteSubscriber(event.stream.streamManager);
        });

        // On every asynchronous exception...
        mySession.on("exception", (exception) => {
          console.warn(exception);
        });

        // --- 4) Connect to the session with a valid user token ---

        // 'getToken' method is simulating what your server-side should do.
        // 'token' parameter should be retrieved and returned by your own backend
        this.getToken().then((token) => {
          // First param is the token got from OpenVidu Server. Second param can be retrieved by every user on event
          // 'streamCreated' (property Stream.connection.data), and will be appended to DOM as the user's nickname
          mySession
            .connect(token, { clientData: userName })
            .then(async () => {
              var devices = await this.OV.getDevices();
              var videoDevices = devices.filter(
                (device) => device.kind === "videoinput"
              );

              // --- 5) Get your own camera stream ---

              // Init a publisher passing undefined as targetElement (we don't want OpenVidu to insert a video
              // element: we will manage it on our own) and with the desired properties
              let publisher = this.OV.initPublisher(undefined, {
                audioSource: undefined, // The source of audio. If undefined default microphone
                videoSource: false, // The source of video. If undefined default webcam
                publishAudio: true, // Whether you want to start publishing with your audio unmuted or not
                publishVideo: false, // Whether you want to start publishing with your video enabled or not
                resolution: "640x480", // The resolution of your video
                frameRate: 30, // The frame rate of your video
                insertMode: "APPEND", // How the video is inserted in the target element 'video-container'
                mirror: false, // Whether to mirror your local video or not
              });

              // --- 6) Publish your stream ---

              mySession.publish(publisher);

              // Set the main video in the page to display our webcam and store our Publisher
              this.setState({
                currentVideoDevice: videoDevices[0],
                mainStreamManager: publisher,
                publisher: publisher,
              });
            })
            .catch((error) => {
              console.log(
                "There was an error connecting to the session:",
                error.code,
                error.message
              );
            });
        });
      }
    );
  }

  leaveSession() {
    // --- 7) Leave the session by calling 'disconnect' method over the Session object ---

    const mySession = this.state.session;

    if (mySession) {
      mySession.disconnect();
    }

    // Empty all properties...
    this.OV = null;
    this.setState({
      session: undefined,
      subscribers: [],
      mySessionId: "SessionA",
      myUserName: "Participant" + Math.floor(Math.random() * 100),
      mainStreamManager: undefined,
      publisher: undefined,
    });
  }

  async switchCamera() {
    try {
      const devices = await this.OV.getDevices();
      var videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
      );

      if (videoDevices && videoDevices.length > 1) {
        var newVideoDevice = videoDevices.filter(
          (device) => device.deviceId !== this.state.currentVideoDevice.deviceId
        );

        if (newVideoDevice.length > 0) {
          // Creating a new publisher with specific videoSource
          // In mobile devices the default and first camera is the front one
          var newPublisher = this.OV.initPublisher(undefined, {
            videoSource: newVideoDevice[0].deviceId,
            publishAudio: true,
            publishVideo: true,
            mirror: true,
          });

          //newPublisher.once("accessAllowed", () => {
          await this.state.session.unpublish(this.state.mainStreamManager);

          await this.state.session.publish(newPublisher);
          this.setState({
            currentVideoDevice: newVideoDevice,
            mainStreamManager: newPublisher,
            publisher: newPublisher,
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  render() {
    const mySessionId = this.state.mySessionId;
    const myUserName = this.state.myUserName;

    return (
      <div className="container">
        {/* {this.state.session === undefined ? (
          <div id="join">
            <div id="join-dialog" className="jumbotron vertical-center">
              <h1> Join a audio session </h1>
              <form className="form-group" onSubmit={this.joinSession}>
                <p>
                  <label>Participant: </label>
                  <input
                    className="form-control"
                    type="text"
                    id="userName"
                    value={myUserName}
                    onChange={this.handleChangeUserName}
                    required
                  />
                </p>
                <p>
                  <label> Session: </label>
                  <input
                    className="form-control"
                    type="text"
                    id="sessionId"
                    value={mySessionId}
                    onChange={this.handleChangeSessionId}
                    required
                  />
                </p>
                <p className="text-center">
                  <input
                    className="btn btn-lg btn-success"
                    name="commit"
                    type="submit"
                    value="JOIN"
                  />
                </p>
              </form>
            </div>
          </div>
        ) : null} */}

        {this.state.session !== undefined ? (
          <div id="session">
            {/* <div id="session-header">
              <h1 id="session-title">{mySessionId}</h1>
              <input
                className="btn btn-large btn-danger"
                type="button"
                id="buttonLeaveSession"
                onClick={this.leaveSession}
                value="Leave session"
              />
            </div> */}

            <div id="video-container" className="col-md-6">
              {this.state.publisher !== undefined ? (
                <div
                  className="stream-container col-md-6 col-xs-6"
                  onClick={() =>
                    this.handleMainVideoStream(this.state.publisher)
                  }
                >
                  <OvComponent streamManager={this.state.publisher} />
                </div>
              ) : null}
              {this.state.subscribers.map((sub, i) => (
                <div
                  key={i}
                  className="stream-container col-md-6 col-xs-6"
                  onClick={() => this.handleMainVideoStream(sub)}
                >
                  <OvComponent streamManager={sub} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {this.state.isLoaded === false && (
          <div style={{ height: "0px" }}>
            <div style={{ width: "45%", margin: "auto" }}>
              <Carousel autoPlay infiniteLoop autoFocus useKeyboardArrows>
                <div>
                  <img
                    src={process.env.PUBLIC_URL + "./image/Stage.PNG"}
                    alt=""
                  />
                  <p className="legend">무대</p>
                </div>
                <div>
                  <img
                    src={process.env.PUBLIC_URL + "./image/Gold.PNG"}
                    alt=""
                  />
                  <p className="legend">보물찾기</p>
                </div>
                <div>
                  <img src={process.env.PUBLIC_URL + "./image/OX.PNG"} alt="" />
                  <p className="legend">O X 게임</p>
                </div>
                <div>
                  <img
                    src={process.env.PUBLIC_URL + "./image/Photo.PNG"}
                    alt=""
                  />
                  <p className="legend">포토존</p>
                </div>
                <div>
                  <img
                    src={process.env.PUBLIC_URL + "./image/Forest.PNG"}
                    alt=""
                  />
                  <p className="legend">인내의 숲</p>
                </div>
                <div>
                  <img
                    src={process.env.PUBLIC_URL + "./image/Gallery.PNG"}
                    alt=""
                  />
                  <p className="legend">전시관</p>
                </div>
              </Carousel>
            </div>
            <p>Loading {this.state.progression} percent...</p>
            <progress value={this.state.progression} max="100"></progress>
          </div>
        )}
        <Unity
          className="unity-div"
          style={{ visibility: this.state.isLoaded ? "visible" : "hidden" }}
          unityContext={unityContext}
        />
      </div>
    );
  }

  /**
   * --------------------------
   * SERVER-SIDE RESPONSIBILITY
   * --------------------------
   * These methods retrieve the mandatory user token from OpenVidu Server.
   * This behavior MUST BE IN YOUR SERVER-SIDE IN PRODUCTION (by using
   * the API REST, openvidu-java-client or openvidu-node-client):
   *   1) Initialize a Session in OpenVidu Server	(POST /openvidu/api/sessions)
   *   2) Create a Connection in OpenVidu Server (POST /openvidu/api/sessions/<SESSION_ID>/connection)
   *   3) The Connection.token must be consumed in Session.connect() method
   */

  getToken() {
    return this.createSession(this.state.mySessionId).then((sessionId) =>
      this.createToken(sessionId)
    );
  }

  createSession(sessionId) {
    return new Promise((resolve, reject) => {
      var data = JSON.stringify({ customSessionId: sessionId });
      axios
        .post(OPENVIDU_SERVER_URL + "/openvidu/api/sessions", data, {
          headers: {
            Authorization:
              "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET),
            "Content-Type": "application/json",
          },
        })
        .then((response) => {
          console.log("CREATE SESION", response);
          resolve(response.data.id);
        })
        .catch((response) => {
          var error = Object.assign({}, response);
          if (error?.response?.status === 409) {
            resolve(sessionId);
          } else {
            console.log(error);
            console.warn(
              "No connection to OpenVidu Server. This may be a certificate error at " +
                OPENVIDU_SERVER_URL
            );
            if (
              window.confirm(
                'No connection to OpenVidu Server. This may be a certificate error at "' +
                  OPENVIDU_SERVER_URL +
                  '"\n\nClick OK to navigate and accept it. ' +
                  'If no certificate warning is shown, then check that your OpenVidu Server is up and running at "' +
                  OPENVIDU_SERVER_URL +
                  '"'
              )
            ) {
              window.location.assign(
                OPENVIDU_SERVER_URL + "/accept-certificate"
              );
            }
          }
        });
    });
  }

  createToken(sessionId) {
    return new Promise((resolve, reject) => {
      var data = {};
      axios
        .post(
          OPENVIDU_SERVER_URL +
            "/openvidu/api/sessions/" +
            sessionId +
            "/connection",
          data,
          {
            headers: {
              Authorization:
                "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET),
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          console.log("TOKEN", response);
          resolve(response.data.token);
        })
        .catch((error) => reject(error));
    });
  }
}

export default withNavigation(WorldManager);
